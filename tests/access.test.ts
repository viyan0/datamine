import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq } from 'drizzle-orm';
import { getDb, getPool } from '../src/db';
import * as schema from '../src/db/schema';
import { agencyAccessForUser } from '../src/lib/access';
import { loadWorkspace } from '../src/lib/workspace';
import { digest } from '../src/lib/security';
import { getAuth } from '../src/lib/auth';
import { POST as acceptInvitation } from '../src/app/api/invitations/accept/route';
import { listSharedProfiles } from '../src/lib/enrollment';
import { analysisVersion, type SavedAnalysis } from '../src/lib/analysis-types';

test('central administration, business isolation, and business owner login invitations', async (t) => {
  const memory = await PGlite.create();
  const server = new PGLiteSocketServer({
    db: memory,
    host: '127.0.0.1',
    port: 54336,
    maxConnections: 5,
  });
  await server.start();
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54336/postgres';
  process.env.BETTER_AUTH_URL = 'http://localhost:3000';
  process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
  const db = getDb();
  const central = {
    id: 'central',
    name: 'Central',
    email: 'central@example.test',
    platformRole: 'admin',
  };
  const owner = { id: 'owner', name: 'Owner', email: 'owner@example.test', platformRole: 'staff' };
  const viewer = {
    id: 'viewer',
    name: 'Viewer',
    email: 'viewer@example.test',
    platformRole: 'staff',
  };
  try {
    await migrate(db, { migrationsFolder: './drizzle' });
    await db.insert(schema.user).values([central, owner, viewer]);
    await db.insert(schema.agencies).values([
      { id: 'one', name: 'One', slug: 'one' },
      { id: 'two', name: 'Two', slug: 'two' },
    ]);
    await db.insert(schema.memberships).values([
      { id: randomUUID(), agencyId: 'one', userId: owner.id, role: 'owner' },
      { id: randomUUID(), agencyId: 'one', userId: viewer.id, role: 'viewer' },
    ]);
    for (const agencyId of ['one', 'two']) {
      await db.insert(schema.connections).values({
        id: agencyId,
        agencyId,
        label: agencyId,
        phoneNumberId: agencyId,
        wabaId: agencyId,
        displayPhone: agencyId,
        accessTokenEncrypted: 'test only',
        appSecretEncrypted: 'test only',
      });
      await db.insert(schema.messages).values({
        id: randomUUID(),
        agencyId,
        connectionId: agencyId,
        direction: 'inbound',
        contactPhone: 'customer',
        type: 'text',
        body: agencyId,
        providerTimestamp: new Date(),
      });
      await db.insert(schema.auditEvents).values({ id: randomUUID(), agencyId, action: 'test' });
    }

    await t.test('central admin sees every business without being a member', async () => {
      const workspace = await loadWorkspace(central, true);
      assert.deepEqual(workspace.agencies.map((a) => a.id).sort(), ['one', 'two']);
      assert.equal(workspace.connections.length, 2);
      assert.equal(workspace.activity.length, 2);
      assert.equal(workspace.messageCount, 0);
      assert.equal(workspace.analytics, undefined);
      assert.equal(workspace.platformOverview?.offersByBusiness.length, 2);
      assert.equal((await agencyAccessForUser(central, 'two', true)).role, 'admin');
      await assert.rejects(agencyAccessForUser(central, 'missing'), { status: 404 });
    });

    await t.test('business data and management stay within membership boundaries', async () => {
      const workspace = await loadWorkspace(owner, true);
      assert.deepEqual(
        workspace.agencies.map((a) => a.id),
        ['one'],
      );
      assert.deepEqual(
        workspace.connections.map((c) => c.agencyId),
        ['one'],
      );
      assert.deepEqual(
        workspace.activity.map((a) => a.agencyName),
        ['One'],
      );
      assert.equal(workspace.messageCount, 1);
      assert.equal(workspace.members.length, 2);
      assert.equal(
        workspace.analytics?.daily.reduce((count, day) => count + day.received, 0),
        1,
      );
      assert.equal((await agencyAccessForUser(owner, 'one', true)).role, 'owner');
      await assert.rejects(agencyAccessForUser(owner, 'two'), { status: 403 });
      await assert.rejects(agencyAccessForUser(viewer, 'one', true), { status: 403 });
      assert.equal((await agencyAccessForUser(viewer, 'one')).role, 'viewer');
      assert.equal((await loadWorkspace({ ...owner, id: 'uninvited' })).agencies.length, 0);
    });

    await t.test(
      'business customers show only consented contacts and interests from their own chats',
      async () => {
        const analysis = (subject: string): SavedAnalysis => ({
          version: analysisVersion,
          model: 'test',
          locale: 'en',
          sourceHash: 'test',
          createdAt: new Date().toISOString(),
          sourceMessageIds: [],
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: 0,
          result: {
            language: 'en',
            services: [subject],
            intent: 'Price request',
            inquiryStatus: 'new',
            summary: subject,
            nextStep: 'Reply',
            reviewNote: null,
            facts: [],
            stopOffers: null,
            subject: { value: subject, messageId: 'source', quote: subject },
          },
        });
        for (const phone of ['shared', 'private', 'pending', 'declined']) {
          await db.insert(schema.customerConsents).values({
            phone,
            status: ['pending', 'declined'].includes(phone) ? phone : 'accepted',
            locale: 'en',
            noticeVersion: 'test',
            noticeAt: new Date(),
            decisionAt: new Date(),
            lastInboundAt: new Date(),
            replyConnectionId: 'one',
            replyMessageId: randomUUID(),
          });
        }
        for (const [id, agencyId, phone, subject] of [
          ['own-shared', 'one', 'shared', 'Flowers'],
          ['other-shared', 'two', 'shared', 'Private medical supplies'],
          ['other-only', 'two', 'private', 'Private request'],
          ['own-pending', 'one', 'pending', 'Unconsented request'],
          ['own-declined', 'one', 'declined', 'Declined request'],
        ]) {
          await db.insert(schema.conversations).values({
            id,
            agencyId,
            connectionId: agencyId,
            contactPhone: phone,
            name: id,
            analysis: analysis(subject),
            lastInboundAt: new Date(),
            lastMessageAt: new Date(),
          });
        }
        await db.insert(schema.sharedProfiles).values([
          {
            id: 'network-shared',
            phone: 'shared',
            name: 'Network name',
            language: 'ar',
            interests: ['Flowers', 'Private medical supplies'],
            destination: 'Private network detail',
            consentVersion: 'test',
            consentAt: new Date(),
          },
          {
            id: 'network-private',
            phone: 'private',
            name: 'Private customer',
            language: 'en',
            interests: ['Private request'],
            consentVersion: 'test',
            consentAt: new Date(),
          },
        ]);
        const own = await listSharedProfiles(owner);
        assert.equal(own.length, 1);
        assert.equal(own[0].name, 'own-shared');
        assert.equal(own[0].language, 'en');
        assert.equal(own[0].destination, 'Flowers');
        assert.deepEqual(own[0].interests, ['Flowers']);
        assert.equal(JSON.stringify(own).includes('Private'), false);
        assert.deepEqual(await listSharedProfiles(viewer), own);
        assert.deepEqual(
          await listSharedProfiles({ id: 'no-memberships', platformRole: 'staff' }),
          [],
        );
        const all = await listSharedProfiles(central);
        assert.equal(all.length, 2);
        assert.deepEqual(all.find((p) => p.phone === 'shared')?.interests, [
          'Flowers',
          'Private medical supplies',
        ]);
      },
    );

    await t.test(
      'owner invitation creates one business login and cannot be redirected or reused',
      async () => {
        const token = randomBytes(32).toString('hex');
        await db.insert(schema.invitations).values({
          id: randomUUID(),
          agencyId: 'two',
          email: 'new-owner@example.test',
          role: 'owner',
          tokenHash: digest(token),
          createdBy: central.id,
          expiresAt: new Date(Date.now() + 3600_000),
        });
        const request = () =>
          new Request('http://localhost:3000/api/invitations/accept', {
            method: 'POST',
            headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
            body: JSON.stringify({
              token,
              name: 'New owner',
              password: 'test-long-password-only',
              agencyId: 'one',
              platformRole: 'admin',
            }),
          });
        assert.equal((await acceptInvitation(request())).status, 200);
        const [created] = await db
          .select()
          .from(schema.user)
          .where(eq(schema.user.email, 'new-owner@example.test'));
        assert.equal(created.platformRole, 'staff');
        const workspace = await loadWorkspace(created);
        assert.deepEqual(
          workspace.agencies.map((a) => ({ id: a.id, role: a.role })),
          [{ id: 'two', role: 'owner' }],
        );
        const [account] = await db
          .select()
          .from(schema.account)
          .where(eq(schema.account.userId, created.id));
        assert.equal(account.providerId, 'credential');
        assert.ok(account.password);
        const login = await getAuth().api.signInEmail({
          body: { email: created.email, password: 'test-long-password-only' },
        });
        assert.equal(login.user.id, created.id);
        assert.equal(login.user.platformRole, 'staff');
        await assert.rejects(agencyAccessForUser(created, 'one'), { status: 403 });
        assert.equal((await acceptInvitation(request())).status, 400);
      },
    );
  } finally {
    await getPool().end();
    await server.stop();
    await memory.close();
  }
});
