import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { and, eq } from 'drizzle-orm';
import { getDb, getPool } from '../src/db';
import * as schema from '../src/db/schema';
import { encrypt } from '../src/lib/security';
import {
  processRecommendations,
  purgeRecommendations,
  scheduleRecommendation,
} from '../src/lib/recommendations';
import { moreRequestFollowsOffer, offerCommand } from '../src/lib/offer-preferences';
import { ingestWebhook } from '../src/lib/webhook';
import { syncCustomerInterests } from '../src/lib/consent';

test('automatic recommendations respect consent, one offer, more, topic stops and sender windows', async (t) => {
  const memory = await PGlite.create();
  const server = new PGLiteSocketServer({
    db: memory,
    host: '127.0.0.1',
    port: 54337,
    maxConnections: 5,
  });
  await server.start();
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54337/postgres';
  process.env.CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  process.env.OPENROUTER_API_KEY = 'isolated-test-only';
  process.env.META_GRAPH_VERSION = 'v26.0';
  const db = getDb();
  const originalFetch = globalThis.fetch;
  const sends: { to: string; text: { body: string } }[] = [];
  let ambiguous = false;
  let invalidId = false;
  let verboseReason = false;
  let duringRank: (() => Promise<void>) | null = null;
  globalThis.fetch = async (url, init) => {
    if (String(url) === 'https://openrouter.ai/api/v1/chat/completions') {
      const input = JSON.parse(JSON.parse(String(init?.body)).messages[1].content) as {
        mode: string;
        latestMessageId: string;
        previousTopic: string;
        waitingTopics: string[];
        blockedTopics: string[];
        messages: { id: string; body: string }[];
        offers: { id: string; text: string }[];
      };
      assert.ok(input.offers.every((o) => !['private', 'expired'].includes(o.id)));
      const latest = input.messages.find((m) => m.id === input.latestMessageId)!;
      const naturalMore = /another offer/i.test(latest.body);
      const stopTopic = /stop phones offers/i.test(latest.body);
      const topic =
        input.mode === 'more' || naturalMore
          ? input.previousTopic
          : /flowers/i.test(latest.body)
            ? 'flowers'
            : 'phones';
      const evidence = input.messages
        .filter((m) => m.body.toLowerCase().includes(topic))
        .map((m) => ({ messageId: m.id, quote: m.body }));
      const offer = input.offers.find((o) => o.text.toLowerCase().includes(topic));
      const eligible =
        !input.blockedTopics.includes(topic) &&
        (input.mode === 'more' || naturalMore || !input.waitingTopics.includes(topic));
      if (duringRank) {
        const work = duringRank;
        duringRank = null;
        await work();
      }
      return Response.json({
        model: 'anthropic/claude-haiku-5.5',
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                action: stopTopic
                  ? 'stopTopic'
                  : input.mode === 'more' || naturalMore
                    ? 'more'
                    : 'interest',
                topic: stopTopic ? 'phones' : eligible && offer ? topic : null,
                offerId: invalidId ? 'invented' : eligible && offer ? offer.id : null,
                reason: verboseReason
                  ? 'This option matches the requested product and stated budget. '.repeat(8)
                  : 'Matches the requested product.',
                evidence:
                  stopTopic || naturalMore
                    ? [{ messageId: latest.id, quote: latest.body }]
                    : evidence,
              }),
            },
          },
        ],
      });
    }
    assert.equal(String(url), 'https://graph.facebook.com/v26.0/12345/messages');
    sends.push(JSON.parse(String(init?.body)));
    assert.ok(sends.at(-1)!.text.body.length <= 4096, 'WhatsApp text length limit');
    if (ambiguous) throw new Error('Lost response');
    return Response.json({ messages: [{ id: `recommendation-${sends.length}` }] });
  };
  try {
    await migrate(db, { migrationsFolder: './drizzle' });
    await db
      .insert(schema.user)
      .values({ id: 'owner', name: 'Owner', email: 'recommendation-test@example.com' });
    await db.insert(schema.agencies).values([
      { id: 'origin', name: 'Original business', slug: 'origin' },
      { id: 'supplier', name: 'Supplier business', slug: 'supplier' },
    ]);
    await db.insert(schema.connections).values([
      {
        id: 'origin-sender',
        agencyId: 'origin',
        label: 'Original',
        phoneNumberId: '12345',
        wabaId: '111',
        displayPhone: '+9647500000001',
        accessTokenEncrypted: encrypt('test', 'origin-sender:token'),
        appSecretEncrypted: encrypt('test-secret', 'origin-sender:secret'),
      },
      {
        id: 'supplier-sender',
        agencyId: 'supplier',
        label: 'Supplier',
        phoneNumberId: '67890',
        wabaId: '222',
        displayPhone: '+9647500000002',
        accessTokenEncrypted: encrypt('test', 'supplier-sender:token'),
        appSecretEncrypted: 'unused',
      },
    ]);
    await db.insert(schema.campaigns).values(
      ['phones-a', 'phones-b', 'flowers', 'own', 'private', 'expired'].map((id) => ({
        id,
        agencyId: id === 'own' ? 'origin' : 'supplier',
        createdBy: 'owner',
        title: id,
        offerText:
          id === 'flowers'
            ? 'Fresh flowers bouquet for 25 USD.'
            : 'New phones with 12 month warranty for 200 USD.',
        locale: 'en',
        status: 'complete',
        networkEnabled: id !== 'private',
        networkExpiresAt: new Date(Date.now() + (id === 'expired' ? -3600000 : 86400000)),
      })),
    );
    async function customer(id: string, status = 'accepted', expired = false) {
      await db.insert(schema.sharedProfiles).values({
        id,
        phone: id,
        name: id,
        language: 'en',
        interests: ['phones'],
        consentVersion: 'test',
        consentAt: new Date(),
      });
      await db.insert(schema.customerConsents).values({
        phone: id,
        status,
        locale: 'en',
        noticeVersion: 'test',
        lastInboundAt: new Date(),
        replyConnectionId: 'origin-sender',
        replyMessageId: randomUUID(),
        replyStatus: 'sent',
      });
      await db.insert(schema.conversations).values({
        id,
        agencyId: 'origin',
        connectionId: 'origin-sender',
        contactPhone: id,
        name: id,
        lastInboundAt: new Date(Date.now() - (expired ? 25 * 3600000 : 1000)),
        lastMessageAt: new Date(),
        analysisStatus: 'complete',
      });
    }
    async function inbound(id: string, body: string, expired = false) {
      const messageId = randomUUID();
      const timestamp = new Date(Date.now() - (expired ? 25 * 3600000 : 0));
      await db.insert(schema.messages).values({
        id: messageId,
        providerMessageId: messageId,
        agencyId: 'origin',
        connectionId: 'origin-sender',
        direction: 'inbound',
        contactPhone: id,
        type: 'text',
        body,
        providerTimestamp: timestamp,
      });
      await db
        .update(schema.conversations)
        .set({ lastInboundAt: timestamp })
        .where(eq(schema.conversations.id, id));
      await db.transaction((tx) => scheduleRecommendation(tx, id));
      return { messageId, timestamp };
    }
    const count = (phone: string) => sends.filter((s) => s.to === phone).length;
    async function webhook(phone: string, body: string, providerMessageId = randomUUID()) {
      const raw = JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '111',
            changes: [
              {
                field: 'messages',
                value: {
                  metadata: { phone_number_id: '12345' },
                  messages: [
                    {
                      id: providerMessageId,
                      from: phone,
                      timestamp: String(Math.floor(Date.now() / 1000)),
                      type: 'text',
                      text: { body },
                    },
                  ],
                },
              },
            ],
          },
        ],
      });
      return ingestWebhook(
        raw,
        `sha256=${createHmac('sha256', 'test-secret').update(raw).digest('hex')}`,
      );
    }
    await t.test(
      'single inquiry sends none; repeat sends one supplier offer and waits',
      async () => {
        await customer('repeat');
        await inbound('repeat', 'I want phones');
        await processRecommendations(5);
        assert.equal(count('repeat'), 0);
        await inbound('repeat', 'Do you have phones for 200 USD?');
        await processRecommendations(5);
        assert.equal(count('repeat'), 1);
        assert.match(sends.at(-1)!.text.body, /Supplier business/);
        assert.match(sends.at(-1)!.text.body, /wa.me\/9647500000002/);
        assert.match(sends.at(-1)!.text.body, /STOP OFFER/);
        await db.transaction((tx) => scheduleRecommendation(tx, 'repeat'));
        await processRecommendations(5);
        await inbound('repeat', 'I still want phones');
        await processRecommendations(5);
        assert.equal(
          count('repeat'),
          1,
          'neither a replay nor another inquiry sends a second offer',
        );
      },
    );
    await t.test('MORE sends one unseen offer then waits again', async () => {
      await inbound('repeat', 'MORE');
      await processRecommendations(5);
      assert.equal(count('repeat'), 2);
      const jobs = await db
        .select()
        .from(schema.recommendationJobs)
        .where(
          and(
            eq(schema.recommendationJobs.profileId, 'repeat'),
            eq(schema.recommendationJobs.status, 'accepted'),
          ),
        );
      assert.equal(new Set(jobs.map((j) => j.campaignId)).size, 2);
      await processRecommendations(5);
      assert.equal(count('repeat'), 2);
    });
    await t.test(
      'second-precision MORE accepts a new reply but rejects delayed pre-offer requests',
      async () => {
        for (const id of ['same-second', 'stale-more']) {
          await customer(id);
          await inbound(id, 'I want phones');
          await inbound(id, 'Which phones are available?');
          await db
            .update(schema.messages)
            .set({ providerTimestamp: new Date(Math.floor(Date.now() / 1000) * 1000 - 5000) })
            .where(
              and(eq(schema.messages.contactPhone, id), eq(schema.messages.direction, 'inbound')),
            );
          await processRecommendations(5);
          assert.equal(count(id), 1);
          const [offer] = await db
            .select()
            .from(schema.messages)
            .where(
              and(eq(schema.messages.contactPhone, id), eq(schema.messages.direction, 'outbound')),
            );
          const trigger = await inbound(id, 'MORE');
          const providerTimestamp = new Date(
            Math.floor(offer.providerTimestamp.getTime() / 1000) * 1000 -
              (id === 'stale-more' ? 1000 : 0),
          );
          await db
            .update(schema.messages)
            .set({ providerTimestamp })
            .where(eq(schema.messages.id, trigger.messageId));
          await db
            .update(schema.conversations)
            .set({ lastInboundAt: providerTimestamp })
            .where(eq(schema.conversations.id, id));
          await processRecommendations(5);
          assert.equal(count(id), id === 'same-second' ? 2 : 1);
        }
        const offeredAt = new Date('2026-10-09T10:00:00.500Z');
        assert.equal(
          moreRequestFollowsOffer(
            {
              providerTimestamp: new Date('2026-10-09T10:00:00Z'),
              createdAt: new Date('2026-10-09T10:00:00.700Z'),
            },
            offeredAt,
          ),
          true,
        );
        assert.equal(
          moreRequestFollowsOffer(
            {
              providerTimestamp: new Date('2026-10-09T10:00:00Z'),
              createdAt: new Date('2026-10-09T10:00:00.300Z'),
            },
            offeredAt,
          ),
          false,
        );
      },
    );
    await t.test(
      'verbose generated reasons stay bounded without dropping a valid recommendation',
      async () => {
        await customer('verbose-reason');
        await inbound('verbose-reason', 'I want phones');
        await inbound('verbose-reason', 'Which phones are available?');
        verboseReason = true;
        await processRecommendations(5);
        verboseReason = false;
        assert.equal(count('verbose-reason'), 1);
        const [job] = await db
          .select()
          .from(schema.recommendationJobs)
          .where(
            and(
              eq(schema.recommendationJobs.profileId, 'verbose-reason'),
              eq(schema.recommendationJobs.status, 'accepted'),
            ),
          );
        assert.ok(job.reason && job.reason.length <= 240);
        assert.ok(job.reason.endsWith('...'));
      },
    );
    await t.test('STOP OFFER blocks only that topic and MORE does not undo it', async () => {
      const id = randomUUID();
      await webhook('repeat', 'STOP OFFER', id);
      await webhook('repeat', 'STOP OFFER', id);
      await processRecommendations(5);
      assert.equal(count('repeat'), 3, 'one confirmation, despite duplicate delivery');
      const [profile] = await db
        .select()
        .from(schema.sharedProfiles)
        .where(eq(schema.sharedProfiles.id, 'repeat'));
      assert.deepEqual(profile.blockedTopics, ['phones']);
      assert.deepEqual(profile.interests, ['phones']);
      const [consent] = await db
        .select()
        .from(schema.customerConsents)
        .where(eq(schema.customerConsents.phone, 'repeat'));
      assert.equal(consent.status, 'accepted');
      await inbound('repeat', 'MORE');
      await processRecommendations(5);
      assert.equal(count('repeat'), 3);
      await inbound('repeat', 'I want flowers');
      await processRecommendations(5);
      await inbound('repeat', 'Which flowers do you have?');
      await processRecommendations(5);
      assert.equal(count('repeat'), 4, 'another interest remains eligible');
      assert.match(sends.at(-1)!.text.body, /Fresh flowers/);
    });
    await t.test(
      'natural MORE and named topic stop use the latest quoted instruction',
      async () => {
        await customer('natural');
        await inbound('natural', 'I want phones');
        await inbound('natural', 'Which phones can I buy?');
        await processRecommendations(5);
        assert.equal(count('natural'), 1);
        await inbound('natural', 'Could you show me another offer?');
        await processRecommendations(5);
        assert.equal(count('natural'), 2);
        await inbound('natural', 'Please stop phones offers');
        await processRecommendations(5);
        assert.equal(count('natural'), 3);
        const [profile] = await db
          .select()
          .from(schema.sharedProfiles)
          .where(eq(schema.sharedProfiles.id, 'natural'));
        assert.deepEqual(profile.blockedTopics, ['phones']);
        assert.equal(profile.status, 'active');
      },
    );
    await t.test('STOP OFFER uses the latest manually sent campaign as fallback', async () => {
      await customer('manual');
      const messageId = randomUUID();
      await db.insert(schema.messages).values({
        id: messageId,
        agencyId: 'origin',
        connectionId: 'origin-sender',
        direction: 'outbound',
        contactPhone: 'manual',
        type: 'text',
        body: 'Phone promotion',
        deliveryStatus: 'delivered',
        providerTimestamp: new Date(Date.now() - 1000),
      });
      await db
        .update(schema.campaigns)
        .set({
          analysis: {
            summary: 'Phones',
            categories: ['Phones'],
            model: 'test',
            sourceHash: 'test',
          },
        })
        .where(eq(schema.campaigns.id, 'phones-a'));
      await db.insert(schema.campaignRecipients).values({
        id: randomUUID(),
        campaignId: 'phones-a',
        profileId: 'manual',
        profileUpdatedAt: new Date(),
        reason: 'Phones requested',
        status: 'accepted',
        messageId,
      });
      await webhook('manual', 'STOP OFFER');
      await processRecommendations(5);
      const [profile] = await db
        .select()
        .from(schema.sharedProfiles)
        .where(eq(schema.sharedProfiles.id, 'manual'));
      assert.deepEqual(profile.blockedTopics, ['phones']);
      assert.equal(count('manual'), 1);
    });
    await t.test(
      'immediate STOP OFFER preserves unfinished analysis and releases stale holds',
      async () => {
        await customer('stop-pending');
        await webhook('stop-pending', 'I want phones');
        await webhook('stop-pending', 'STOP OFFER');
        const [pendingThread] = await db
          .select()
          .from(schema.conversations)
          .where(eq(schema.conversations.id, 'stop-pending'));
        const [heldProfile] = await db
          .select()
          .from(schema.sharedProfiles)
          .where(eq(schema.sharedProfiles.id, 'stop-pending'));
        assert.equal(pendingThread.analysisStatus, 'pending');
        assert.ok(
          pendingThread.analysisDueAt,
          'STOP must not discard the previous inbound analysis',
        );
        assert.equal(heldProfile.offerHold, true);
        await processRecommendations(5);
        assert.equal(
          count('stop-pending'),
          1,
          'control acknowledgement does not require analysis completion',
        );
        await db
          .update(schema.conversations)
          .set({ analysisStatus: 'complete', analysisDueAt: null })
          .where(eq(schema.conversations.id, 'stop-pending'));
        await db.transaction((tx) => syncCustomerInterests(tx, 'stop-pending'));
        const [released] = await db
          .select()
          .from(schema.sharedProfiles)
          .where(eq(schema.sharedProfiles.id, 'stop-pending'));
        assert.equal(released.offerHold, false);
        await db
          .update(schema.sharedProfiles)
          .set({ offerHold: true })
          .where(eq(schema.sharedProfiles.id, 'stop-pending'));
        await webhook('stop-pending', 'STOP OFFER');
        const [reconciled] = await db
          .select()
          .from(schema.sharedProfiles)
          .where(eq(schema.sharedProfiles.id, 'stop-pending'));
        assert.equal(
          reconciled.offerHold,
          false,
          'a completed thread reconciles the hold immediately',
        );
        await processRecommendations(5);
      },
    );
    await t.test(
      'pending consent, held profiles and closed sender windows send nothing',
      async () => {
        for (const id of ['pending', 'held', 'closed']) {
          await customer(id, id === 'pending' ? 'pending' : 'accepted', id === 'closed');
          if (id === 'held')
            await db
              .update(schema.sharedProfiles)
              .set({ offerHold: true })
              .where(eq(schema.sharedProfiles.id, id));
          await inbound(id, 'I want phones', id === 'closed');
          await inbound(id, 'Any phones available?', id === 'closed');
          await processRecommendations(5);
          assert.equal(count(id), 0);
        }
      },
    );
    await t.test(
      'finishing a sibling analysis releases earlier eligible conversations once',
      async () => {
        await customer('siblings');
        await db
          .update(schema.sharedProfiles)
          .set({ offerHold: true })
          .where(eq(schema.sharedProfiles.id, 'siblings'));
        await db.insert(schema.conversations).values({
          id: 'sibling-other',
          agencyId: 'supplier',
          connectionId: 'supplier-sender',
          contactPhone: 'siblings',
          name: 'siblings',
          lastInboundAt: new Date(),
          lastMessageAt: new Date(),
          analysisStatus: 'pending',
        });
        await inbound('siblings', 'I want phones');
        await inbound('siblings', 'Which phones are available?');
        assert.equal(
          (
            await db
              .select()
              .from(schema.recommendationJobs)
              .where(eq(schema.recommendationJobs.profileId, 'siblings'))
          ).length,
          0,
        );
        await db
          .update(schema.sharedProfiles)
          .set({ offerHold: false })
          .where(eq(schema.sharedProfiles.id, 'siblings'));
        await db
          .update(schema.conversations)
          .set({ analysisStatus: 'complete' })
          .where(eq(schema.conversations.id, 'sibling-other'));
        await db.transaction((tx) => scheduleRecommendation(tx, 'sibling-other'));
        await processRecommendations(5);
        assert.equal(count('siblings'), 1);
        await db.transaction((tx) => scheduleRecommendation(tx, 'siblings'));
        await db.transaction((tx) => scheduleRecommendation(tx, 'sibling-other'));
        await processRecommendations(5);
        assert.equal(count('siblings'), 1);
      },
    );
    await t.test(
      'hallucinated offer ID is rejected and an ambiguous send is never retried',
      async () => {
        await customer('invalid');
        await inbound('invalid', 'I want phones');
        await inbound('invalid', 'What phones are in stock?');
        invalidId = true;
        await processRecommendations(5);
        invalidId = false;
        assert.equal(count('invalid'), 0);
        await customer('uncertain');
        await inbound('uncertain', 'I want phones');
        await inbound('uncertain', 'What phones are in stock?');
        ambiguous = true;
        await processRecommendations(5);
        ambiguous = false;
        assert.equal(count('uncertain'), 1);
        await processRecommendations(5);
        await inbound('uncertain', 'Any phones please?');
        await processRecommendations(5);
        assert.equal(count('uncertain'), 1);
      },
    );
    await t.test(
      'a profile hold arriving during AI ranking defers rather than loses the request',
      async () => {
        await customer('rank-hold');
        await inbound('rank-hold', 'I want phones');
        await inbound('rank-hold', 'Which phones are available?');
        duringRank = async () => {
          await db
            .update(schema.sharedProfiles)
            .set({ offerHold: true })
            .where(eq(schema.sharedProfiles.id, 'rank-hold'));
        };
        await processRecommendations(5);
        assert.equal(count('rank-hold'), 0);
        const jobs = await db
          .select()
          .from(schema.recommendationJobs)
          .where(
            and(
              eq(schema.recommendationJobs.profileId, 'rank-hold'),
              eq(schema.recommendationJobs.status, 'pending'),
            ),
          );
        assert.equal(jobs.length, 1);
        await db
          .update(schema.sharedProfiles)
          .set({ offerHold: false })
          .where(eq(schema.sharedProfiles.id, 'rank-hold'));
        await db
          .update(schema.recommendationJobs)
          .set({ dueAt: new Date(Date.now() - 1000) })
          .where(eq(schema.recommendationJobs.id, jobs[0].id));
        await processRecommendations(5);
        assert.equal(count('rank-hold'), 1);
      },
    );
    await t.test('named topic stop does not depend on an available offer catalog', async () => {
      await db.update(schema.campaigns).set({ networkEnabled: false });
      await customer('no-catalog');
      await inbound('no-catalog', 'Please stop phones offers');
      await processRecommendations(5);
      const [p] = await db
        .select()
        .from(schema.sharedProfiles)
        .where(eq(schema.sharedProfiles.id, 'no-catalog'));
      assert.deepEqual(p.blockedTopics, ['phones']);
      assert.equal(count('no-catalog'), 1);
    });
    await t.test(
      'cleanup removes recommendation references before profile and message deletion',
      async () => {
        await db.transaction((tx) => purgeRecommendations(tx, 'repeat'));
        assert.equal(
          (
            await db
              .select()
              .from(schema.recommendationJobs)
              .where(eq(schema.recommendationJobs.profileId, 'repeat'))
          ).length,
          0,
        );
        assert.equal(offerCommand('STOP OFFERS!'), 'stop');
        assert.equal(offerCommand('المزيد'), 'more');
        assert.equal(offerCommand('STOP ALL'), null);
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
    await getPool().end();
    await server.stop();
    await memory.close();
  }
});
