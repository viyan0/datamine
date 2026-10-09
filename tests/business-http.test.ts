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
      if (url.pathname === '/api/agencies') return createBusiness(request);
      if (url.pathname === '/api/invitations') return invite(request);
      if (url.pathname === '/api/invitations/accept') return accept(request);
      if (url.pathname === '/api/customers') return customers();
      if (url.pathname === '/api/campaigns')
        return request.method === 'GET' ? offers() : createOffer(request);
      const id = url.pathname.match(/^\/api\/campaigns\/([^/]+)$/)?.[1];
      return id
        ? changeOffer(request, { params: Promise.resolve({ id }) })
        : new Response(null, { status: 404 });
    }),
  );
}

test('HTTP business setup and campaign permissions use real authenticated sessions', async () => {
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
  const call = (path: string, cookie = '', body?: unknown) =>
    fetch(`${origin}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
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
    const offer = (agencyId: string) => ({
      agencyId,
      title: 'Flowers',
      offerText: 'Fresh rose bouquet for 20 USD.',
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
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await getPool().end();
    await database.stop();
    await memory.close();
  }
});
