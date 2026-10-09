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
import type { SavedAnalysis } from '../src/lib/analysis-types';
import { clearCustomerData } from '../src/lib/consent';
import { updateConversationDetails } from '../src/lib/inbox';
import { createProduct, updateProduct } from '../src/lib/products';
import {
  deliverRecipient,
  launchCampaign,
  listCampaigns,
  matchCampaign,
  campaignSender,
  attachCampaignTemplate,
  publishCampaign,
  networkAvailability,
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
    body: 'Test business: Phone offer. Reply STOP to stop offers.',
  };
  globalThis.fetch = async (url, init) => {
    if (String(url) === 'https://openrouter.ai/api/v1/chat/completions') {
      const request = JSON.parse(String(init?.body));
      const input = JSON.parse(request.messages[1].content);
      assert.match(request.messages[0].content, /blockedTopics override interests/);
      assert.ok(
        input.customers.every((p: { blockedTopics: unknown }) => Array.isArray(p.blockedTopics)),
      );
      assert.ok(
        input.customers.every(
          (p: { interests: string[] }) => p.interests.length === 1 && p.interests[0] === 'Phones',
        ),
      );
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
    assert.match(String(url), /^https:\/\/graph.facebook.com\/v26.0\/(12345|66666)\/messages$/);
    sends.push(JSON.parse(String(init?.body)));
    if (ambiguous) throw new Error('Response lost after submission');
    return Response.json({ messages: [{ id: `test-message-${sends.length}` }] });
  };
  const recent = () => new Date(Date.now() - 60_000);
  const expired = () => new Date(Date.now() - 25 * 3600_000);
  const savedAnalysis: SavedAnalysis = {
    result: {
      language: 'en',
      services: ['Phones'],
      intent: 'Phone purchase',
      inquiryStatus: 'new',
      summary: 'Interested in phones.',
      nextStep: 'Share available phones.',
      reviewNote: null,
      subject: null,
      facts: [],
      stopOffers: null,
    },
    model: 'test',
    version: 4,
    locale: 'en',
    createdAt: recent().toISOString(),
    sourceHash: 'test',
    sourceMessageIds: [],
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
  };
  try {
    await migrate(db, { migrationsFolder: './drizzle' });
    await db
      .insert(schema.user)
      .values({ id: 'owner', name: 'Test owner', email: 'test@example.com' });
    await db.insert(schema.agencies).values([
      { id: 'business', name: 'Test business', slug: 'test' },
      { id: 'different-business', name: 'Different business', slug: 'different' },
    ]);
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
        verifiedAt: new Date(),
      })),
    );
    await db.insert(schema.connections).values({
      id: 'foreign-sender',
      agencyId: 'different-business',
      label: 'Own business sender',
      phoneNumberId: '66666',
      wabaId: '222',
      displayPhone: 'test only',
      accessTokenEncrypted: encrypt('test-only', 'foreign-sender:token'),
      appSecretEncrypted: 'unused',
      campaignSender: false,
    });
    await db.insert(schema.sharedProfiles).values(
      ['open', 'expired', 'other', 'future', 'missing'].map((id) => ({
        id,
        phone: id,
        name: id,
        language: 'en',
        interests: ['Phones', 'Private interest from another business'],
        consentVersion: 'test',
        consentAt: new Date(),
      })),
    );
    await db.insert(schema.customerConsents).values(
      ['open', 'expired', 'other', 'future', 'missing'].map((phone) => ({
        phone,
        status: 'accepted',
        locale: 'en',
        noticeVersion: 'test',
        decisionAt: new Date(),
        lastInboundAt: recent(),
        replyConnectionId: phone === 'missing' ? 'foreign-sender' : 'sender',
        replyMessageId: randomUUID(),
        replyStatus: 'sent',
      })),
    );
    await db.insert(schema.conversations).values(
      ['open', 'expired', 'other', 'future'].map((id) => ({
        id,
        agencyId: 'business',
        connectionId: id === 'other' ? 'other' : 'sender',
        contactPhone: id,
        name: id,
        analysis: savedAnalysis,
        lastInboundAt:
          id === 'expired'
            ? expired()
            : id === 'future'
              ? new Date(Date.now() + 3600_000)
              : recent(),
        lastMessageAt: recent(),
      })),
    );
    await db.insert(schema.conversations).values({
      id: 'foreign-chat',
      agencyId: 'different-business',
      connectionId: 'foreign-sender',
      contactPhone: 'missing',
      name: 'Foreign customer',
      analysis: savedAnalysis,
      lastInboundAt: recent(),
      lastMessageAt: recent(),
    });
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
        assert.equal(rows.filter((r) => r.status === 'windowClosed').length, 3);
        assert.ok(rows.every((r) => r.profileId !== 'missing'));
        const r = await recipient(id);
        await deliverRecipient(r.id);
        await deliverRecipient(r.id);
        assert.equal(sends.length, 1);
        assert.equal(sends[0].type, 'text');
        assert.equal(sends[0].to, 'open');
        assert.equal(
          (sends[0].text as { body: string }).body,
          campaignReplyBody({
            businessName: 'Test business',
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
        assert.equal(
          (sends[1].text as { body: string }).body,
          `Datamine · Test business\n\n${pending.body}`,
        );
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
    await t.test(
      'business campaigns stay private and use only the central sender and its reply window',
      async () => {
        ambiguous = false;
        assert.equal((await campaignSender('different-business'))?.id, 'sender');
        assert.equal(await campaignSender('different-business', 'foreign-sender'), undefined);
        const id = randomUUID();
        await db.insert(schema.campaigns).values({
          id,
          agencyId: 'different-business',
          createdBy: 'owner',
          title: 'Own offer',
          offerText: 'Phone offer for our own customers.',
          locale: 'en',
        });
        await matchCampaign(id);
        const own = await listCampaigns(['different-business'], false);
        assert.deepEqual(
          own.map((c) => c.id),
          [id],
        );
        assert.deepEqual(
          own[0].recipients?.map((p) => p.phone),
          ['missing'],
        );
        assert.deepEqual(own[0].recipients?.[0].interests, ['Phones']);
        assert.ok((await listCampaigns(['business'], false)).every((c) => c.id !== id));
        await assert.rejects(
          () => attachCampaignTemplate(id, pending, 'foreign-sender'),
          /campaignSenderMissing/,
        );
        await assert.rejects(
          () => attachCampaignTemplate(id, pending, 'sender'),
          /templateSellerMissing/,
        );
        await assert.rejects(() => launchCampaign(id, 'reply'), /campaignReplyWindowClosed/);
        await db.insert(schema.conversations).values({
          id: 'central-missing',
          agencyId: 'business',
          connectionId: 'sender',
          contactPhone: 'missing',
          name: 'Central customer',
          analysis: savedAnalysis,
          lastInboundAt: recent(),
          lastMessageAt: recent(),
        });
        await launchCampaign(id, 'reply');
        const [r] = await db
          .select()
          .from(schema.campaignRecipients)
          .where(eq(schema.campaignRecipients.campaignId, id));
        await deliverRecipient(r.id);
        assert.equal(sends.length, 4);
        assert.equal(sends[3].to, 'missing');
        assert.match((sends[3].text as { body: string }).body, /^Datamine · Different business/);
        await db.delete(schema.conversations).where(eq(schema.conversations.id, 'central-missing'));
      },
    );
    await t.test(
      'consent and topic revisions cancel queued offers before external submission',
      async () => {
        const id = await offer();
        await launchCampaign(id, 'reply');
        await db
          .update(schema.sharedProfiles)
          .set({ blockedTopics: ['Phones'], updatedAt: new Date(Date.now() + 1) })
          .where(eq(schema.sharedProfiles.id, 'open'));
        await deliverRecipient((await recipient(id)).id);
        assert.equal((await recipient(id)).status, 'cancelled');
        assert.equal(sends.length, 4);
        await db
          .update(schema.sharedProfiles)
          .set({ blockedTopics: [], updatedAt: new Date() })
          .where(eq(schema.sharedProfiles.id, 'open'));
        const declined = await offer();
        await launchCampaign(declined, 'reply');
        await db
          .update(schema.customerConsents)
          .set({ status: 'declined' })
          .where(eq(schema.customerConsents.phone, 'open'));
        await deliverRecipient((await recipient(declined)).id);
        assert.equal((await recipient(declined)).status, 'cancelled');
        assert.equal(sends.length, 4);
        const newOffer = await offer();
        assert.ok(
          !(await listCampaigns(['business'], false))
            .find((c) => c.id === newOffer)!
            .recipients!.some((r) => r.phone === 'open'),
        );
      },
    );
    await t.test('network availability is explicit, expires, and can be withdrawn', async () => {
      const id = await offer();
      assert.equal(
        (await listCampaigns(['business'], false)).find((c) => c.id === id)?.networkEnabled,
        false,
      );
      assert.throws(
        () => networkAvailability(true, new Date(Date.now() - 1).toISOString()),
        /offerExpired/,
      );
      assert.throws(
        () => networkAvailability(true, new Date(Date.now() + 100 * 86400000).toISOString()),
        /offerExpired/,
      );
      assert.throws(() => networkAvailability(true), /offerExpired/);
      const expiry = new Date(Date.now() + 86400000).toISOString();
      await publishCampaign(id, true, expiry);
      let saved = (await listCampaigns(['business'], false)).find((c) => c.id === id)!;
      assert.equal(saved.networkEnabled, true);
      assert.equal(saved.networkExpiresAt, expiry);
      await publishCampaign(id, false);
      saved = (await listCampaigns(['business'], false)).find((c) => c.id === id)!;
      assert.equal(saved.networkEnabled, false);
      assert.equal(saved.networkExpiresAt, null);
    });
    await t.test(
      'archiving a catalog offer blocks linked manual launch, publication and queued delivery',
      async () => {
        await db
          .update(schema.customerConsents)
          .set({ status: 'accepted' })
          .where(eq(schema.customerConsents.phone, 'open'));
        const manager = { id: 'owner', platformRole: 'admin' };
        const product = await createProduct(manager, {
          contactPhone: '9647500000002',
          agencyId: 'business',
          name: 'Phone offer',
          description: 'Available phone',
          price: '100',
          currency: 'USD',
        });
        const id = await offer();
        await db
          .update(schema.campaigns)
          .set({ productId: product.id })
          .where(eq(schema.campaigns.id, id));
        await launchCampaign(id, 'reply');
        const queued = await recipient(id);
        await updateProduct(manager, product.id, { active: false });
        await deliverRecipient(queued.id);
        assert.equal((await recipient(id)).status, 'cancelled');
        assert.equal(sends.length, 4);
        await assert.rejects(
          () => publishCampaign(id, true, new Date(Date.now() + 86400000).toISOString()),
          /productArchived/,
        );
        const next = await offer();
        await db
          .update(schema.campaigns)
          .set({ productId: product.id })
          .where(eq(schema.campaigns.id, next));
        await assert.rejects(() => launchCampaign(next, 'reply'), /productArchived/);
        assert.equal(
          (await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, id)))[0]
            .networkEnabled,
          false,
        );
        await updateProduct(manager, product.id, { active: true });
        await launchCampaign(next, 'reply');
        await db
          .update(schema.products)
          .set({ expiresAt: new Date(Date.now() - 1) })
          .where(eq(schema.products.id, product.id));
        await deliverRecipient((await recipient(next)).id);
        assert.equal(
          (await recipient(next)).status,
          'cancelled',
          'an expired offer cannot send after queueing',
        );
        assert.equal(sends.length, 4);
      },
    );
    await t.test(
      'manual topic corrections and analysis resets invalidate queued offers',
      async () => {
        await db
          .update(schema.customerConsents)
          .set({ status: 'accepted' })
          .where(eq(schema.customerConsents.phone, 'open'));
        const id = await offer();
        await launchCampaign(id, 'reply');
        const [before] = await db
          .select()
          .from(schema.sharedProfiles)
          .where(eq(schema.sharedProfiles.id, 'open'));
        await updateConversationDetails('business', 'open', { destination: 'Laptops' });
        const [corrected] = await db
          .select()
          .from(schema.sharedProfiles)
          .where(eq(schema.sharedProfiles.id, 'open'));
        assert.ok(corrected.updatedAt.getTime() > before.updatedAt.getTime());
        assert.equal((await recipient(id)).status, 'cancelled');
        await deliverRecipient((await recipient(id)).id);
        assert.equal(sends.length, 4);
        await assert.rejects(
          () =>
            updateConversationDetails('different-business', 'open', {
              destination: 'Wrong business',
            }),
          /notFound/,
        );
        await updateConversationDetails('business', 'open', { note: 'Private staff note' });
        const [noteOnly] = await db
          .select()
          .from(schema.sharedProfiles)
          .where(eq(schema.sharedProfiles.id, 'open'));
        assert.equal(
          noteOnly.updatedAt.getTime(),
          corrected.updatedAt.getTime(),
          'Private notes are not marketing preferences',
        );
        const reset = await offer();
        await launchCampaign(reset, 'reply');
        await updateConversationDetails('business', 'open', { automatic: true });
        const [held] = await db
          .select()
          .from(schema.sharedProfiles)
          .where(eq(schema.sharedProfiles.id, 'open'));
        const [thread] = await db
          .select()
          .from(schema.conversations)
          .where(eq(schema.conversations.id, 'open'));
        assert.equal(held.offerHold, true);
        assert.equal(thread.analysisStatus, 'pending');
        assert.equal(thread.analysis, null);
        assert.equal((await recipient(reset)).status, 'cancelled');
        await deliverRecipient((await recipient(reset)).id);
        assert.equal(sends.length, 4);
        await db
          .update(schema.conversations)
          .set({ analysis: savedAnalysis, analysisStatus: 'complete' })
          .where(eq(schema.conversations.id, 'open'));
        await db
          .update(schema.sharedProfiles)
          .set({ offerHold: false, updatedAt: new Date() })
          .where(eq(schema.sharedProfiles.id, 'open'));
      },
    );
    await t.test(
      'deleting customer data removes a queued offer and never recreates message data',
      async () => {
        await db
          .update(schema.customerConsents)
          .set({ status: 'accepted' })
          .where(eq(schema.customerConsents.phone, 'open'));
        const id = await offer();
        await launchCampaign(id, 'reply');
        const queued = await recipient(id);
        await db.transaction(async (tx) => {
          await tx
            .select()
            .from(schema.customerConsents)
            .where(eq(schema.customerConsents.phone, 'open'))
            .for('update');
          await tx
            .update(schema.customerConsents)
            .set({ status: 'declined' })
            .where(eq(schema.customerConsents.phone, 'open'));
          await clearCustomerData(tx, 'open');
        });
        await deliverRecipient(queued.id);
        assert.equal(sends.length, 4);
        assert.equal(
          (await db.select().from(schema.messages).where(eq(schema.messages.contactPhone, 'open')))
            .length,
          0,
        );
        assert.equal(
          (
            await db
              .select()
              .from(schema.sharedProfiles)
              .where(eq(schema.sharedProfiles.phone, 'open'))
          ).length,
          0,
        );
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
    await getPool().end();
    await server.stop();
    await memory.close();
    sends = [];
  }
});
