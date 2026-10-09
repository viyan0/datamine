import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq } from 'drizzle-orm';
import { getDb, getPool } from '../src/db';
import * as schema from '../src/db/schema';
import { encrypt } from '../src/lib/security';
import { campaignReplyBody } from '../src/lib/campaign-delivery';
import {
  deliverRecipient,
  launchCampaign,
  listCampaigns,
  matchCampaign,
} from '../src/lib/campaigns';

test('real campaign replies respect sender windows, consent, and durable send claims', async (t) => {
  const memory = await PGlite.create();
  const server = new PGLiteSocketServer({
    db: memory,
    host: '127.0.0.1',
    port: 54334,
    maxConnections: 5,
  });
  await server.start();
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54334/postgres';
  process.env.CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  process.env.OPENROUTER_API_KEY = 'isolated-test-only';
  process.env.META_GRAPH_VERSION = 'v26.0';
  const db = getDb();
  const originalFetch = globalThis.fetch;
  let sends: Record<string, unknown>[] = [];
  let ambiguous = false;
  const pending = {
    id: 'pending',
    name: 'test_offer',
    language: 'en',
    body: 'Phone offer. Reply STOP to stop offers.',
  };
  globalThis.fetch = async (url, init) => {
    if (String(url) === 'https://openrouter.ai/api/v1/chat/completions') {
      const request = JSON.parse(String(init?.body));
      const input = JSON.parse(request.messages[1].content);
      return Response.json({
        model: 'anthropic/claude-haiku-5.5',
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                summary: 'A relevant phone offer.',
                categories: ['Phones'],
                matches: input.customers.map((p: { id: string }) => ({
                  id: p.id,
                  reason: 'Interested in phones.',
                })),
              }),
            },
          },
        ],
      });
    }
    if (String(url).includes('/message_templates'))
      return Response.json({
        data: [
          {
            ...pending,
            category: 'MARKETING',
            status: 'PENDING',
            components: [{ type: 'BODY', text: pending.body }],
          },
        ],
      });
    assert.match(String(url), /^https:\/\/graph.facebook.com\/v26.0\/12345\/messages$/);
    sends.push(JSON.parse(String(init?.body)));
    if (ambiguous) throw new Error('Response lost after submission');
    return Response.json({ messages: [{ id: `test-message-${sends.length}` }] });
  };
  const recent = () => new Date(Date.now() - 60_000);
  const expired = () => new Date(Date.now() - 25 * 3600_000);
  try {
    await migrate(db, { migrationsFolder: './drizzle' });
    await db
      .insert(schema.user)
      .values({ id: 'owner', name: 'Test owner', email: 'test@example.com' });
    await db
      .insert(schema.agencies)
      .values({ id: 'business', name: 'Test business', slug: 'test' });
    await db.insert(schema.connections).values(
      ['sender', 'other'].map((id, i) => ({
        id,
        agencyId: 'business',
        label: id,
        phoneNumberId: i ? '67890' : '12345',
        wabaId: '111',
        displayPhone: 'test only',
        accessTokenEncrypted: encrypt('test-only', `${id}:token`),
        appSecretEncrypted: 'unused',
        campaignSender: !i,
      })),
    );
    await db.insert(schema.sharedProfiles).values(
      ['open', 'expired', 'other', 'future', 'missing'].map((id) => ({
        id,
        phone: id,
        name: id,
        language: 'en',
        interests: ['Phones'],
        consentVersion: 'test',
        consentAt: new Date(),
      })),
    );
    await db.insert(schema.conversations).values(
      ['open', 'expired', 'other', 'future'].map((id) => ({
        id,
        agencyId: 'business',
        connectionId: id === 'other' ? 'other' : 'sender',
        contactPhone: id,
        name: id,
        lastInboundAt:
          id === 'expired'
            ? expired()
            : id === 'future'
              ? new Date(Date.now() + 3600_000)
              : recent(),
        lastMessageAt: recent(),
      })),
    );
    async function offer(template: typeof pending | null = null) {
      const id = randomUUID();
      await db.insert(schema.campaigns).values({
        id,
        agencyId: 'business',
        createdBy: 'owner',
        title: 'Phones',
        offerText: 'Phone offer for interested customers.',
        locale: 'en',
        template,
        senderId: template ? 'sender' : null,
      });
      await matchCampaign(id);
      return id;
    }
    async function recipient(id: string) {
      const rows = await db
        .select()
        .from(schema.campaignRecipients)
        .where(eq(schema.campaignRecipients.campaignId, id));
      return rows.find((r) => r.profileId === 'open')!;
    }
    await t.test(
      'no-template offers send real text only to an open window on the selected sender',
      async () => {
        const id = await offer();
        const view = (await listCampaigns([], true)).find((c) => c.id === id)!;
        assert.equal(view.recipients?.filter((r) => r.replyWindowExpiresAt).length, 1);
        assert.ok(
          new Date(
            view.recipients!.find((r) => r.name === 'open')!.replyWindowExpiresAt!,
          ).getTime() > Date.now(),
        );
        await launchCampaign(id, 'reply');
        const rows = await db
          .select()
          .from(schema.campaignRecipients)
          .where(eq(schema.campaignRecipients.campaignId, id));
        assert.equal(rows.filter((r) => r.status === 'queued').length, 1);
        assert.equal(rows.filter((r) => r.status === 'windowClosed').length, 4);
        const r = await recipient(id);
        await deliverRecipient(r.id);
        await deliverRecipient(r.id);
        assert.equal(sends.length, 1);
        assert.equal(sends[0].type, 'text');
        assert.equal(sends[0].to, 'open');
        assert.equal(
          (sends[0].text as { body: string }).body,
          campaignReplyBody({
            offerText: 'Phone offer for interested customers.',
            locale: 'en',
            template: null,
          }),
        );
        assert.equal((await recipient(id)).status, 'accepted');
      },
    );
    await t.test('expired windows cannot launch and are checked again after queueing', async () => {
      await db
        .update(schema.conversations)
        .set({ lastInboundAt: expired() })
        .where(eq(schema.conversations.id, 'open'));
      const closed = await offer();
      await assert.rejects(() => launchCampaign(closed, 'reply'), /campaignReplyWindowClosed/);
      await db
        .update(schema.conversations)
        .set({ lastInboundAt: recent() })
        .where(eq(schema.conversations.id, 'open'));
      const id = await offer();
      await launchCampaign(id, 'reply');
      await db
        .update(schema.conversations)
        .set({ lastInboundAt: expired() })
        .where(eq(schema.conversations.id, 'open'));
      await deliverRecipient((await recipient(id)).id);
      assert.equal((await recipient(id)).status, 'windowClosed');
      assert.equal(sends.length, 1);
      await db
        .update(schema.conversations)
        .set({ lastInboundAt: recent() })
        .where(eq(schema.conversations.id, 'open'));
    });
    await t.test('opting out after launch prevents delivery', async () => {
      const id = await offer();
      await launchCampaign(id, 'reply');
      await db
        .update(schema.sharedProfiles)
        .set({ status: 'withdrawn' })
        .where(eq(schema.sharedProfiles.id, 'open'));
      await deliverRecipient((await recipient(id)).id);
      assert.equal((await recipient(id)).status, 'cancelled');
      assert.equal(sends.length, 1);
      await db
        .update(schema.sharedProfiles)
        .set({ status: 'active' })
        .where(eq(schema.sharedProfiles.id, 'open'));
    });
    await t.test(
      'pending templates remain blocked as templates but their preview can be sent as a permitted reply',
      async () => {
        const id = await offer(pending);
        await assert.rejects(() => launchCampaign(id), /templateChanged/);
        await launchCampaign(id, 'reply');
        await deliverRecipient((await recipient(id)).id);
        assert.equal(sends.length, 2);
        assert.equal(sends[1].type, 'text');
        assert.equal((sends[1].text as { body: string }).body, pending.body);
      },
    );
    await t.test('a lost provider response is not automatically sent again', async () => {
      const id = await offer();
      await launchCampaign(id, 'reply');
      ambiguous = true;
      const r = await recipient(id);
      await deliverRecipient(r.id);
      await deliverRecipient(r.id);
      assert.equal((await recipient(id)).status, 'uncertain');
      assert.equal(sends.length, 3);
    });
  } finally {
    globalThis.fetch = originalFetch;
    await getPool().end();
    await server.stop();
    await memory.close();
    sends = [];
  }
});
