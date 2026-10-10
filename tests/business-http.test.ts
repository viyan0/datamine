import 'next/dist/server/node-environment-baseline.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { createRequestStoreForAPI } from 'next/dist/server/async-storage/request-store.js';
import { createWorkStore } from 'next/dist/server/async-storage/work-store.js';
import { workAsyncStorage } from 'next/dist/server/app-render/work-async-storage.external.js';
import { workUnitAsyncStorage } from 'next/dist/server/app-render/work-unit-async-storage.external.js';
import { hashPassword } from 'better-auth/crypto';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq } from 'drizzle-orm';
import { getDb, getPool } from '../src/db';
import * as schema from '../src/db/schema';
import { getAuth } from '../src/lib/auth';
import { POST as createBusiness } from '../src/app/api/agencies/route';
import { POST as invite } from '../src/app/api/invitations/route';
import { POST as accept } from '../src/app/api/invitations/accept/route';
import { GET as customers } from '../src/app/api/customers/route';
import { GET as offers, POST as createOffer } from '../src/app/api/campaigns/route';
import { POST as changeOffer } from '../src/app/api/campaigns/[id]/route';
import { GET as products, POST as createProduct } from '../src/app/api/products/route';
import { PATCH as updateProduct } from '../src/app/api/products/[id]/route';
import {
  GET as platformSettings,
  POST as savePlatformSettings,
} from '../src/app/api/platform-settings/route';
import { businessChatOfferMode } from '../src/lib/platform-settings';

import { loadWorkspace } from '../src/lib/workspace';
import { GET as inboxList } from '../src/app/api/agencies/[id]/conversations/route';
import { GET as inboxMessages } from '../src/app/api/agencies/[id]/messages/route';
import {
  GET as inboxDetail,
  PATCH as inboxEdit,
} from '../src/app/api/agencies/[id]/conversations/[conversationId]/route';
import {
  GET as inboxAnalysis,
  POST as inboxAnalyze,
} from '../src/app/api/agencies/[id]/conversations/[conversationId]/analysis/route';
import { POST as inboxReply } from '../src/app/api/agencies/[id]/conversations/[conversationId]/reply/route';
import { POST as inboxEnroll } from '../src/app/api/agencies/[id]/conversations/[conversationId]/enrollment/route';
import type { ProductView } from '../src/lib/product-types';

// Real request cookies and route guards, without starting a second Next dev build.
async function dispatch(request: NextRequest) {
  const url = new URL(request.url);
  const requestStore = createRequestStoreForAPI(
    request,
    url,
    { tags: [], expirationsByCacheKind: new Map() },
    undefined,
    undefined,
    undefined,
  );
  const work = createWorkStore({
    page: `${url.pathname}/route`,
    buildId: 'isolated-test',
    deploymentId: 'isolated-test',
    previouslyRevalidatedTags: [],
    renderOpts: {
      cacheLifeProfiles: { default: { stale: 0, revalidate: 60, expire: 60 } },
      staticPageGenerationTimeout: 60,
      cacheComponents: false,
      validationLevel: 'warning',
      experimental: {
        isRoutePPREnabled: false,
        authInterrupts: false,
        useCacheTimeout: 1000,
        durableUseCacheEntries: false,
      },
      assetPrefix: '',
      isBuildTimePrerendering: false,
      isDraftMode: false,
      waitUntil: undefined,
      onClose: () => {},
      onAfterTaskError: undefined,
    },
  });
  return workAsyncStorage.run(work, () =>
    workUnitAsyncStorage.run(requestStore, async () => {
      if (url.pathname.startsWith('/api/auth/')) return getAuth().handler(request);
      const inbox = url.pathname.match(
        /^\/api\/agencies\/([^/]+)\/(messages|conversations)(?:\/([^/]+))?(?:\/(analysis|reply|enrollment))?$/,
      );
      if (inbox) {
        const context = {
          params: Promise.resolve({ id: inbox[1], conversationId: inbox[3] || '' }),
        };
        if (inbox[2] === 'messages') return inboxMessages(request, context);
        if (!inbox[3]) return inboxList(request, context);
        if (inbox[4] === 'analysis')
          return request.method === 'GET'
            ? inboxAnalysis(request, context)
            : inboxAnalyze(request, context);
        if (inbox[4] === 'reply') return inboxReply(request, context);
        if (inbox[4] === 'enrollment') return inboxEnroll(request, context);
        return request.method === 'PATCH'
          ? inboxEdit(request, context)
          : inboxDetail(request, context);
      }
      if (url.pathname === '/api/agencies') return createBusiness(request);
      if (url.pathname === '/api/invitations') return invite(request);
      if (url.pathname === '/api/invitations/accept') return accept(request);
      if (url.pathname === '/api/customers') return customers();
      if (url.pathname === '/api/platform-settings')
        return request.method === 'GET' ? platformSettings() : savePlatformSettings(request);
      if (url.pathname === '/api/products')
        return request.method === 'GET' ? products() : createProduct(request);
      const productId = url.pathname.match(/^\/api\/products\/([^/]+)$/)?.[1];
      if (productId) return updateProduct(request, { params: Promise.resolve({ id: productId }) });
      if (url.pathname === '/api/campaigns')
        return request.method === 'GET' ? offers() : createOffer(request);
      const id = url.pathname.match(/^\/api\/campaigns\/([^/]+)$/)?.[1];
      return id
        ? changeOffer(request, { params: Promise.resolve({ id }) })
        : new Response(null, { status: 404 });
    }),
  );
}

test('HTTP business setup and campaign permissions use real authenticated sessions', async (t) => {
  const memory = await PGlite.create();
  const database = new PGLiteSocketServer({
    db: memory,
    host: '127.0.0.1',
    port: 54338,
    maxConnections: 5,
  });
  await database.start();
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54338/postgres';
  process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
  process.env.AUTOMATION_DISABLED = 'true';
  const db = getDb();
  let origin = '';
  const server = createServer(async (incoming, outgoing) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
      const headers = new Headers();
      for (const [key, value] of Object.entries(incoming.headers)) {
        if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
      const response = await dispatch(
        new NextRequest(`${origin}${incoming.url}`, {
          method: incoming.method,
          headers,
          ...(['GET', 'HEAD'].includes(incoming.method || '')
            ? {}
            : { body: Buffer.concat(chunks) }),
        }),
      );
      outgoing.statusCode = response.status;
      response.headers.forEach((value, key) => {
        if (key !== 'set-cookie') outgoing.setHeader(key, value);
      });
      outgoing.setHeader('set-cookie', response.headers.getSetCookie());
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      outgoing.writeHead(500).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  origin = `http://127.0.0.1:${address.port}`;
  process.env.BETTER_AUTH_URL = origin;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (url, options) => {
    assert.equal(new URL(String(url)).origin, origin, 'Test must never call external services');
    return originalFetch(url, options);
  };
  const call = (path: string, cookie = '', body?: unknown, method?: string) =>
    fetch(`${origin}${path}`, {
      method: method || (body === undefined ? 'GET' : 'POST'),
      headers: {
        origin,
        cookie,
        'content-type': 'application/json',
        'x-forwarded-for': '127.0.0.1',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const password = 'isolated-owner-password';
  const login = async (email: string) => {
    const response = await call('/api/auth/sign-in/email', '', { email, password });
    assert.equal(response.status, 200);
    return response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
  };
  try {
    await migrate(db, { migrationsFolder: './drizzle' });
    for (const [id, platformRole] of [
      ['central', 'admin'],
      ['viewer', 'staff'],
    ]) {
      await db
        .insert(schema.user)
        .values({ id, name: id, email: `${id}@example.test`, platformRole });
      await db.insert(schema.account).values({
        id,
        userId: id,
        accountId: id,
        providerId: 'credential',
        password: await hashPassword(password),
      });
    }
    assert.equal((await call('/api/customers')).status, 401);
    const central = await login('central@example.test');
    const agencyIds: string[] = [];
    for (const slug of ['first', 'second']) {
      const response = await call('/api/agencies', central, { name: slug, slug, locale: 'en' });
      assert.equal(response.status, 201);
      agencyIds.push((await response.json()).id);
    }
    await db.delete(schema.memberships).where(eq(schema.memberships.userId, 'central'));
    const invitation = await call('/api/invitations', central, {
      agencyId: agencyIds[0],
      email: 'owner@example.test',
      role: 'owner',
      locale: 'en',
    });
    assert.equal(invitation.status, 201);
    const token = new URL((await invitation.json()).url).hash.slice(1);
    assert.equal(
      (await call('/api/invitations/accept', '', { token, name: 'Business owner', password }))
        .status,
      200,
    );
    const owner = await login('owner@example.test');
    await db
      .insert(schema.memberships)
      .values({ id: randomUUID(), agencyId: agencyIds[0], userId: 'viewer', role: 'viewer' });
    const viewer = await login('viewer@example.test');
    await t.test(
      'admin has platform totals without business membership or inbox access',
      async () => {
        await db
          .insert(schema.agencies)
          .values({ id: 'platform-only', name: 'Datamine', slug: 'datamine', isPlatform: true });
        await db
          .insert(schema.memberships)
          .values({ id: randomUUID(), agencyId: agencyIds[0], userId: 'central', role: 'owner' });
        const adminWorkspace = await loadWorkspace(
          { id: 'central', name: 'Admin', email: 'central@example.test', platformRole: 'admin' },
          true,
        );
        assert.equal(adminWorkspace.agencies.length, 2);
        assert.ok(adminWorkspace.agencies.every((a) => a.id !== 'platform-only'));
        assert.ok(adminWorkspace.members.every((m) => m.email !== 'central@example.test'));
        assert.equal(adminWorkspace.analytics, undefined);
        assert.equal(adminWorkspace.platformOverview?.activeOffers, 0);
        const ownerUser = (
          await db.select().from(schema.user).where(eq(schema.user.email, 'owner@example.test'))
        )[0];
        const businessWorkspace = await loadWorkspace(ownerUser, true);
        assert.deepEqual(
          businessWorkspace.agencies.map((a) => a.id),
          [agencyIds[0]],
        );
        assert.equal(businessWorkspace.platformOverview, undefined);
        assert.ok(businessWorkspace.analytics);
        const base = '/api/agencies/' + agencyIds[0];
        for (const [suffix, method] of [
          ['messages', 'GET'],
          ['conversations', 'GET'],
          ['conversations/test-chat', 'GET'],
          ['conversations/test-chat', 'PATCH'],
          ['conversations/test-chat/analysis', 'GET'],
          ['conversations/test-chat/analysis', 'POST'],
          ['conversations/test-chat/reply', 'POST'],
          ['conversations/test-chat/enrollment', 'POST'],
        ]) {
          assert.equal(
            (await call(base + '/' + suffix, central, method === 'GET' ? undefined : {}, method))
              .status,
            403,
            suffix + ' must reject admin',
          );
        }
        assert.equal((await call(base + '/conversations')).status, 401);
        assert.equal((await call(base + '/conversations', owner)).status, 200);
        assert.equal((await call(base + '/messages', owner)).status, 200);
        assert.equal(
          (await call('/api/agencies/' + agencyIds[1] + '/conversations', owner)).status,
          403,
        );
        await db.delete(schema.memberships).where(eq(schema.memberships.userId, 'central'));
      },
    );
    const offer = (agencyId: string) => ({
      agencyId,
      title: 'Flowers',
      offerText: 'Fresh rose bouquet for 20 USD.',
      contactPhone: '9647500000002',
      locale: 'en',
    });
    const ownCreated = await call('/api/campaigns', owner, offer(agencyIds[0]));
    assert.equal(ownCreated.status, 201);
    const ownOfferId = (await ownCreated.json()).id;
    const foreignCreated = await call('/api/campaigns', central, offer(agencyIds[1]));
    assert.equal(foreignCreated.status, 201);
    const foreignOfferId = (await foreignCreated.json()).id;
    assert.equal((await call('/api/campaigns', owner, offer(agencyIds[1]))).status, 403);
    assert.equal((await call('/api/campaigns', viewer, offer(agencyIds[0]))).status, 403);
    assert.equal(
      (
        await call('/api/invitations', owner, {
          agencyId: agencyIds[0],
          email: 'other@example.test',
          role: 'owner',
        })
      ).status,
      403,
    );
    for (const action of [
      { action: 'send', mode: 'reply' },
      {
        action: 'network',
        enabled: true,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      },
    ]) {
      assert.equal((await call(`/api/campaigns/${ownOfferId}`, viewer, action)).status, 403);
      assert.equal((await call(`/api/campaigns/${foreignOfferId}`, owner, action)).status, 403);
    }
    assert.equal(
      (
        await call(`/api/campaigns/${ownOfferId}`, owner, {
          action: 'network',
          enabled: true,
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        })
      ).status,
      200,
    );
    assert.deepEqual(
      (await (await call('/api/campaigns', owner)).json()).campaigns.map(
        (c: { id: string }) => c.id,
      ),
      [ownOfferId],
    );
    assert.equal((await (await call('/api/campaigns', central)).json()).campaigns.length, 2);
    for (const [index, agencyId] of agencyIds.entries()) {
      const phone = `964700000000${index}`;
      await db.insert(schema.connections).values({
        id: agencyId,
        agencyId,
        label: 'Test',
        phoneNumberId: agencyId,
        wabaId: 'test',
        displayPhone: phone,
        accessTokenEncrypted: 'never-used',
        appSecretEncrypted: 'never-used',
      });
      await db.insert(schema.conversations).values({
        id: agencyId,
        agencyId,
        connectionId: agencyId,
        contactPhone: phone,
        name: `Customer ${index}`,
        lastInboundAt: new Date(),
        lastMessageAt: new Date(),
      });
      await db.insert(schema.customerConsents).values({
        phone,
        status: 'accepted',
        locale: 'en',
        noticeVersion: 'test',
        decisionAt: new Date(),
        lastInboundAt: new Date(),
        replyConnectionId: agencyId,
        replyMessageId: randomUUID(),
      });
      await db.insert(schema.sharedProfiles).values({
        id: agencyId,
        phone,
        name: `Customer ${index}`,
        language: 'en',
        consentVersion: 'test',
        consentAt: new Date(),
      });
    }
    assert.deepEqual(
      (await (await call('/api/customers', owner)).json()).profiles.map(
        (p: { name: string }) => p.name,
      ),
      ['Customer 0'],
    );
    assert.equal((await (await call('/api/customers', central)).json()).profiles.length, 2);
    await t.test(
      'product CRUD is tenant scoped and campaign details use the saved catalog',
      async () => {
        assert.equal((await call('/api/products')).status, 401);
        const productInput = {
          agencyId: agencyIds[0],
          name: 'Rose bouquet',
          contactPhone: '9647500000002',
          imageUrl: 'https://example.com/roses.jpg',
          description: 'Twelve fresh roses',
          price: '25000',
        };
        const created = await call('/api/products', owner, productInput);
        assert.equal(created.status, 201);
        const product: ProductView = (await created.json()).product;
        assert.equal(product.price, '25000.00');
        assert.equal(product.currency, 'IQD');
        assert.equal(product.active, true);
        assert.equal(product.locale, 'en');
        assert.ok(new Date(product.expiresAt) > new Date());
        const catalog = async () =>
          (
            await db
              .select()
              .from(schema.campaigns)
              .where(eq(schema.campaigns.productId, product.id))
          ).find((c) => c.catalogOnly)!;
        const liveCatalog = await catalog();
        assert.equal(liveCatalog.networkEnabled, true);
        assert.equal(liveCatalog.networkExpiresAt?.toISOString(), product.expiresAt);
        assert.equal(liveCatalog.status, 'ready');
        assert.equal(liveCatalog.analysis, null);
        assert.equal(liveCatalog.dueAt, null);
        assert.equal(
          (await (await call('/api/campaigns', owner)).json()).campaigns.some(
            (c: { id: string }) => c.id === liveCatalog.id,
          ),
          false,
        );
        for (const expiresAt of [
          new Date(Date.now() - 1000).toISOString(),
          new Date(Date.now() + 91 * 86400000).toISOString(),
        ])
          assert.equal(
            (await call('/api/products', owner, { ...productInput, expiresAt })).status,
            422,
          );
        assert.equal(
          (await call('/api/products', owner, { ...productInput, locale: 'invalid' })).status,
          400,
        );
        assert.equal(
          (await call('/api/products', owner, { ...productInput, agencyId: agencyIds[1] })).status,
          403,
        );
        assert.equal((await call('/api/products', viewer, productInput)).status, 403);
        const other = await call('/api/products', central, {
          ...productInput,
          agencyId: agencyIds[1],
        });
        assert.equal(other.status, 201);
        const otherId = (await other.json()).product.id;
        for (const invalidPrice of ['-1', '1.234', '1e6', '10000000000', 'NaN', 123]) {
          assert.equal(
            (await call('/api/products', owner, { ...productInput, price: invalidPrice })).status,
            400,
          );
        }
        assert.equal(
          (await call('/api/products', owner, { ...productInput, currency: 'I' })).status,
          400,
        );
        assert.equal((await (await call('/api/products', central)).json()).products.length, 2);
        for (const cookie of [owner, viewer]) {
          assert.deepEqual(
            (await (await call('/api/products', cookie)).json()).products.map(
              (p: ProductView) => p.id,
            ),
            [product.id],
          );
        }
        assert.equal(
          (await call(`/api/products/${otherId}`, owner, { price: '1' }, 'PATCH')).status,
          403,
        );
        assert.equal(
          (await call(`/api/products/${product.id}`, viewer, { active: false }, 'PATCH')).status,
          403,
        );
        assert.equal(
          (await call(`/api/products/${product.id}`, owner, { agencyId: agencyIds[1] }, 'PATCH'))
            .status,
          400,
        );
        assert.equal((await call(`/api/products/${product.id}`, owner, {}, 'PATCH')).status, 400);
        const changed = await call(
          `/api/products/${product.id}`,
          owner,
          { price: '19.5', currency: 'usd' },
          'PATCH',
        );
        assert.equal(changed.status, 200);
        assert.equal((await changed.json()).product.price, '19.50');
        assert.equal((await catalog()).id, liveCatalog.id);
        assert.equal(
          (await catalog()).offerText,
          'Rose bouquet\n\nTwelve fresh roses\n\nPrice: 19.50 USD',
        );
        const catalogOffer = await call('/api/campaigns', owner, {
          agencyId: agencyIds[0],
          productId: product.id,
          title: 'Wrong client title',
          offerText: 'Wrong client price USD 1',
          locale: 'en',
          networkEnabled: true,
          networkExpiresAt: new Date(Date.now() + 86400000).toISOString(),
        });
        assert.equal(catalogOffer.status, 201);
        const offerId = (await catalogOffer.json()).id;
        const [saved] = await db
          .select()
          .from(schema.campaigns)
          .where(eq(schema.campaigns.id, offerId));
        assert.equal(saved.title, 'Rose bouquet');
        assert.equal(saved.offerText, 'Rose bouquet\n\nTwelve fresh roses\n\nPrice: 19.50 USD');
        assert.equal(saved.productId, product.id);
        assert.equal(
          (
            await call('/api/campaigns', owner, {
              agencyId: agencyIds[0],
              productId: otherId,
              locale: 'en',
            })
          ).status,
          404,
        );
        assert.equal(
          (await call(`/api/products/${product.id}`, central, { price: '20' }, 'PATCH')).status,
          200,
        );
        const [snapshot] = await db
          .select()
          .from(schema.campaigns)
          .where(eq(schema.campaigns.id, offerId));
        assert.equal(snapshot.offerText, saved.offerText);
        assert.match((await catalog()).offerText, /Price: 20\.00 USD/);
        assert.equal(
          (await call(`/api/products/${product.id}`, owner, { active: false }, 'PATCH')).status,
          200,
        );
        const [archivedOffer] = await db
          .select()
          .from(schema.campaigns)
          .where(eq(schema.campaigns.id, offerId));
        assert.equal(archivedOffer.networkEnabled, false);
        assert.equal(archivedOffer.networkExpiresAt, null);
        assert.equal((await catalog()).networkEnabled, false);
        assert.equal(
          (
            await call('/api/campaigns', owner, {
              agencyId: agencyIds[0],
              productId: product.id,
              locale: 'en',
            })
          ).status,
          409,
        );
        const staleExpiry = new Date(Date.now() - 1000).toISOString();
        assert.equal(
          (await call(`/api/products/${product.id}`, owner, { expiresAt: staleExpiry }, 'PATCH'))
            .status,
          200,
        );
        assert.equal(
          (await call(`/api/products/${product.id}`, owner, { active: true }, 'PATCH')).status,
          422,
        );
        assert.equal((await catalog()).networkEnabled, false, 'failed activation rolls back');
        const nextExpiry = new Date(Date.now() + 2 * 86400000).toISOString();
        assert.equal(
          (
            await call(
              `/api/products/${product.id}`,
              owner,
              { active: true, locale: 'ar', expiresAt: nextExpiry },
              'PATCH',
            )
          ).status,
          200,
        );
        const restored = await catalog();
        assert.equal(restored.id, liveCatalog.id);
        assert.equal(restored.networkEnabled, true);
        assert.equal(restored.locale, 'ar');
        assert.equal(restored.networkExpiresAt?.toISOString(), nextExpiry);
        assert.match(restored.offerText, /السعر: 20\.00 USD/);
        assert.equal(
          (await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, offerId)))[0]
            .networkEnabled,
          false,
          'restoring the catalog does not republish manual campaigns',
        );
        assert.equal(
          (
            await db
              .select()
              .from(schema.campaigns)
              .where(eq(schema.campaigns.productId, product.id))
          ).filter((c) => c.catalogOnly).length,
          1,
        );

        const freshBusiness = await call('/api/agencies', central, {
          name: 'New supplier',
          slug: 'new-supplier',
          locale: 'en',
        });
        assert.equal(freshBusiness.status, 201);
        const freshAgencyId = (await freshBusiness.json()).id;
        const freshProduct = await call('/api/products', central, {
          ...productInput,
          agencyId: freshAgencyId,
        });
        assert.equal(freshProduct.status, 201);
        const freshProductId = (await freshProduct.json()).product.id;
        const [freshCatalog] = await db
          .select()
          .from(schema.campaigns)
          .where(eq(schema.campaigns.productId, freshProductId));
        assert.equal(
          freshCatalog.networkEnabled,
          true,
          'suppliers with no customers can publish immediately',
        );
        assert.equal(freshCatalog.catalogOnly, true);
        assert.equal(
          (
            await db
              .select()
              .from(schema.conversations)
              .where(eq(schema.conversations.agencyId, freshAgencyId))
          ).length,
          0,
        );
        const copy = await call('/api/campaigns', owner, {
          agencyId: agencyIds[0],
          productId: product.id,
          locale: 'ar',
        });
        assert.equal(copy.status, 201);
        const [manualCopy] = await db
          .select()
          .from(schema.campaigns)
          .where(eq(schema.campaigns.id, (await copy.json()).id));
        assert.equal(manualCopy.networkEnabled, false);
        assert.equal(manualCopy.catalogOnly, false);
      },
    );
    await t.test('only the central administrator switches business chat offers', async () => {
      const mode = { businessChatOffers: 'businessFirst' };
      assert.equal((await call('/api/platform-settings', '', mode)).status, 401);
      assert.equal((await call('/api/platform-settings', owner, mode)).status, 403);
      assert.equal((await call('/api/platform-settings', owner)).status, 403);
      assert.equal(
        (await call('/api/platform-settings', central, { businessChatOffers: 'sometimes' })).status,
        400,
      );
      assert.deepEqual(await (await call('/api/platform-settings', central)).json(), {
        businessChatOffers: 'immediate',
      });
      assert.equal((await call('/api/platform-settings', central, mode)).status, 200);
      assert.equal(await businessChatOfferMode(), 'businessFirst');
      assert.deepEqual(await (await call('/api/platform-settings', central)).json(), mode);
    });
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await getPool().end();
    await database.stop();
    await memory.close();
  }
});
