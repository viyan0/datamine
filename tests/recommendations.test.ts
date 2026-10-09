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
  wakeWaitingRecommendations,
} from '../src/lib/recommendations';
import { moreRequestFollowsOffer, offerCommand } from '../src/lib/offer-preferences';
import { ingestWebhook } from '../src/lib/webhook';
import { syncCustomerInterests } from '../src/lib/consent';
import { centralConnection } from '../src/lib/central-whatsapp';
import { createProduct, updateProduct } from '../src/lib/products';

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
  const rankingInputs: {
    latestMessageId: string;
    previousTopic: string | null;
    waitingTopics: string[];
    messages: { id: string; body: string }[];
  }[] = [];
  let ambiguous = false;
  let invalidId = false;
  let verboseReason = false;
  let staleTopic = false;
  let mixedTopicEvidence = false;
  let wrongRequestAction = false;
  let templateStatus = 'PENDING';
  const templateCatalog: {
    id: string;
    name: string;
    language: string;
    category: string;
    components: { type: string; text: string }[];
  }[] = [];
  let duringRank: (() => Promise<void>) | null = null;
  let duringSend: (() => Promise<void>) | null = null;
  globalThis.fetch = async (url, init) => {
    if (String(url) === 'https://openrouter.ai/api/v1/chat/completions') {
      const payload = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
      if (payload.classification === 'offerRequest') {
        return Response.json({
          model: 'anthropic/claude-haiku-5.5',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: JSON.stringify({
                  offerRequest:
                    /offers?/i.test(payload.latestMessage) && !/stop/i.test(payload.latestMessage),
                }),
              },
            },
          ],
        });
      }
      if (payload.validation === 'repeatedInterest') {
        const named = payload.evidence
          .map(
            (e: { quote: string }) =>
              e.quote.toLowerCase().match(/phones|camera|bikes|chairs|flowers/)?.[0],
          )
          .filter(Boolean);
        return Response.json({
          model: 'anthropic/claude-haiku-5.5',
          choices: [
            {
              finish_reason: 'stop',
              message: { content: JSON.stringify({ sameTopic: new Set(named).size === 1 }) },
            },
          ],
        });
      }
      const input = JSON.parse(JSON.parse(String(init?.body)).messages[1].content) as {
        mode: string;
        requestedTopic?: string;
        latestMessageId: string;
        previousTopic: string | null;
        currentInterest: { value: string; messageId: string; quote: string } | null;
        waitingTopics: string[];
        blockedTopics: string[];
        messages: { id: string; body: string }[];
        offers: { id: string; text: string }[];
      };
      rankingInputs.push(input);
      assert.ok(
        input.offers.every((o) => !['private', 'expired', 'archived-product'].includes(o.id)),
      );
      const latest = input.messages.find((m) => m.id === input.latestMessageId)!;
      const contextualFollowup = latest.body === 'any offers for me?';
      const stopTopic = /stop phones offers/i.test(latest.body);
      const requested = !stopTopic && (input.mode === 'more' || /offers?/i.test(latest.body));
      const unnamed = !/camera|bikes|chairs|flowers|phones/i.test(latest.body);
      const topicRequest =
        input.requestedTopic ||
        (unnamed
          ? input.currentInterest?.value ||
            input.messages.filter((m) => /camera|bikes|chairs|flowers|phones/i.test(m.body)).at(-1)
              ?.body ||
            input.previousTopic ||
            ''
          : latest.body);
      const topic = staleTopic
        ? 'phones'
        : /camera/i.test(topicRequest)
          ? 'camera'
          : /bikes/i.test(topicRequest)
            ? 'bikes'
            : /chairs/i.test(topicRequest)
              ? 'chairs'
              : /flowers/i.test(topicRequest)
                ? 'flowers'
                : /phones/i.test(topicRequest)
                  ? 'phones'
                  : '';
      const evidence = input.messages
        .filter(
          (m) =>
            mixedTopicEvidence ||
            (!!topic && m.body.toLowerCase().includes(topic)) ||
            ((requested || contextualFollowup) && m.id === latest.id),
        )
        .map((m) => ({ messageId: m.id, quote: m.body }));
      const offer = topic
        ? input.offers.find((o) => o.text.toLowerCase().includes(topic))
        : undefined;
      const eligible =
        !input.blockedTopics.includes(topic) && (requested || !input.waitingTopics.includes(topic));
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
                  : requested && !wrongRequestAction
                    ? 'request'
                    : 'interest',
                topic: stopTopic
                  ? 'phones'
                  : requested || (eligible && offer)
                    ? topic || null
                    : null,
                offerId: invalidId ? 'invented' : eligible && offer ? offer.id : null,
                reason: verboseReason
                  ? 'This option matches the requested product and stated budget. '.repeat(8)
                  : 'Matches the requested product.',
                evidence: stopTopic ? [{ messageId: latest.id, quote: latest.body }] : evidence,
              }),
            },
          },
        ],
      });
    }
    if (String(url).startsWith('https://graph.facebook.com/v26.0/111/message_templates')) {
      if (init?.method === 'POST') {
        const input = JSON.parse(String(init.body));
        const entry = { ...input, id: randomUUID() };
        templateCatalog.push(entry);
        return Response.json({ id: entry.id, status: templateStatus });
      }
      return Response.json({
        data: templateCatalog.map((t) => ({ ...t, status: templateStatus })),
      });
    }
    assert.equal(String(url), 'https://graph.facebook.com/v26.0/12345/messages');
    const sent = JSON.parse(String(init?.body));
    if (sent.type === 'template') {
      assert.equal(templateStatus, 'APPROVED');
      sent.text = {
        body: templateCatalog.find((t) => t.name === sent.template.name)!.components[0].text,
      };
    }
    sends.push(sent);
    assert.ok(sends.at(-1)!.text.body.length <= 4096, 'WhatsApp text length limit');
    assert.doesNotMatch(
      sends.at(-1)!.text.body,
      /wa.me\//,
      'recommendation replies stay in the central chat',
    );
    if (duringSend) {
      const work = duringSend;
      duringSend = null;
      await work();
    }
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
      { id: 'no-whatsapp', name: 'Business without WhatsApp', slug: 'no-whatsapp' },
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
        campaignSender: true,
        verifiedAt: new Date(),
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
        verifiedAt: new Date(),
      },
    ]);
    await db.insert(schema.campaigns).values(
      ['phones-a', 'phones-b', 'flowers', 'camera', 'own', 'no-phone', 'private', 'expired'].map(
        (id) => ({
          id,
          agencyId: id === 'own' ? 'origin' : id === 'no-phone' ? 'no-whatsapp' : 'supplier',
          createdBy: 'owner',
          title: id,
          offerText:
            id === 'own'
              ? 'Central business bikes for 80 USD.'
              : id === 'no-phone'
                ? 'Office chairs for 50 USD.'
                : id === 'camera'
                  ? 'Camera for 1000000 IQD.'
                  : id === 'flowers'
                    ? 'Fresh flowers bouquet for 25 USD.'
                    : 'New phones with 12 month warranty for 200 USD.',
          locale: 'en',
          status: 'complete',
          networkEnabled: id !== 'private',
          networkExpiresAt: new Date(Date.now() + (id === 'expired' ? -3600000 : 86400000)),
        }),
      ),
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
        assert.match(sends.at(-1)!.text.body, /Reply here for details/);
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
    await t.test(
      'contextual first-offer requests use only that phone and its own offer history',
      async () => {
        const originalCount = count('repeat');
        for (const [phone, request, expectedOffer] of [
          ['other-phone', 'I want phones', /New phones/],
          ['camera-phone', 'i want a camera please', /Camera for 1000000 IQD/],
        ] as const) {
          await customer(phone);
          await inbound(phone, request);
          await processRecommendations(5);
          assert.equal(count(phone), 0, 'one inquiry still waits for repeated interest');
          const latest = await inbound(phone, 'any offers for me?');
          await processRecommendations(5);
          const input = rankingInputs.find((item) => item.latestMessageId === latest.messageId)!;
          assert.equal(input.previousTopic, null);
          assert.deepEqual(input.waitingTopics, []);
          assert.deepEqual(
            input.messages.map((m) => m.body),
            [request, 'any offers for me?'],
          );
          assert.equal(count(phone), 1);
          assert.equal(sends.at(-1)!.to, phone);
          assert.match(sends.at(-1)!.text.body, expectedOffer);
          await processRecommendations(5);
          assert.equal(count(phone), 1, 'the same request cannot send twice');
        }
        assert.equal(count('repeat'), originalCount, 'another phone does not send to the original');
        await customer('no-context');
        const latest = await inbound('no-context', 'any offers for me?');
        await processRecommendations(5);
        assert.equal(count('no-context'), 1, 'ask for the topic instead of staying silent');
        assert.match(sends.at(-1)!.text.body, /Which product or service/);
        const [decision] = await db
          .select()
          .from(schema.recommendationJobs)
          .where(eq(schema.recommendationJobs.triggerMessageId, latest.messageId));
        assert.equal(decision.status, 'accepted');
        assert.equal(decision.mode, 'response');
        assert.ok(decision.reason, 'keep the decision reason for diagnosis');
      },
    );
    await t.test(
      'a generic follow-up cannot revive a superseded interest from the same phone',
      async () => {
        await customer('changed-topic');
        await inbound('changed-topic', 'I want phones');
        await processRecommendations(5);
        const camera = await inbound('changed-topic', 'I want a camera');
        await db
          .update(schema.conversations)
          .set({
            analysis: {
              result: {
                language: 'en',
                services: ['Cameras'],
                intent: 'Camera purchase',
                inquiryStatus: 'new',
                summary: 'The latest interest is a camera.',
                nextStep: 'Show camera offers.',
                reviewNote: null,
                facts: [],
                stopOffers: null,
                subject: { value: 'camera', messageId: camera.messageId, quote: 'I want a camera' },
              },
              model: 'test',
              version: 5,
              locale: 'en',
              createdAt: new Date().toISOString(),
              sourceHash: 'test',
              sourceMessageIds: [camera.messageId],
              inputTokens: 0,
              outputTokens: 0,
              latencyMs: 0,
            },
          })
          .where(eq(schema.conversations.id, 'changed-topic'));
        mixedTopicEvidence = true;
        try {
          await processRecommendations(5);
        } finally {
          mixedTopicEvidence = false;
        }
        assert.equal(count('changed-topic'), 0);
        await inbound('changed-topic', 'any offers for me?');
        staleTopic = true;
        try {
          await processRecommendations(5);
        } finally {
          staleTopic = false;
        }
        assert.equal(
          count('changed-topic'),
          0,
          'reject an AI choice evidenced only by the older topic',
        );
        await inbound('changed-topic', 'any offers for me?');
        await processRecommendations(5);
        assert.equal(count('changed-topic'), 1);
        assert.match(sends.at(-1)!.text.body, /Camera for 1000000 IQD/);
      },
    );
    await t.test(
      'an explicit offer request needs no repetition and exhausted MORE gets one reply',
      async () => {
        await customer('direct-request');
        await inbound('direct-request', 'What camera offers do you have?');
        wrongRequestAction = true;
        try {
          await processRecommendations(5);
        } finally {
          wrongRequestAction = false;
        }
        assert.equal(count('direct-request'), 1);
        assert.match(sends.at(-1)!.text.body, /Camera for 1000000 IQD/);
        await inbound('direct-request', 'more offers');
        await processRecommendations(5);
        assert.equal(count('direct-request'), 2);
        assert.match(sends.at(-1)!.text.body, /No more matching offers for camera/);
        await processRecommendations(5);
        assert.equal(count('direct-request'), 2, 'no duplicate offer or empty-result reply');
      },
    );
    await t.test(
      'MORE after a new topic requests that topic, not the last sent offer topic',
      async () => {
        await customer('switch-before-more');
        await inbound('switch-before-more', 'Any phones offers?');
        await processRecommendations(5);
        assert.equal(count('switch-before-more'), 1);
        const first = sends.at(-1)!.text.body;
        await inbound('switch-before-more', 'I want a camera');
        await processRecommendations(5);
        assert.equal(count('switch-before-more'), 1);
        await inbound('switch-before-more', 'more offers');
        await processRecommendations(5);
        assert.equal(count('switch-before-more'), 2);
        assert.match(first, /New phones/);
        assert.match(sends.at(-1)!.text.body, /Camera for 1000000 IQD/);
      },
    );
    await t.test(
      'central chat can recommend its own business and suppliers without WhatsApp',
      async () => {
        await customer('central-business');
        await inbound('central-business', 'I want bikes');
        await inbound('central-business', 'Which bikes are available?');
        await processRecommendations(5);
        assert.equal(count('central-business'), 1);
        assert.match(sends.at(-1)!.text.body, /Original business/);
        assert.match(sends.at(-1)!.text.body, /Central business bikes/);
        await customer('no-supplier-phone');
        await inbound('no-supplier-phone', 'I want chairs');
        await inbound('no-supplier-phone', 'Which chairs are available?');
        await processRecommendations(5);
        assert.equal(count('no-supplier-phone'), 1);
        assert.match(sends.at(-1)!.text.body, /Business without WhatsApp/);
        assert.match(sends.at(-1)!.text.body, /Reply here for details/);
        assert.doesNotMatch(sends.at(-1)!.text.body, /wa.me\//);
      },
    );
    await t.test('a business inbox cannot substitute for the central customer window', async () => {
      await customer('central-closed', 'accepted', true);
      await inbound('central-closed', 'I want phones', true);
      await inbound('central-closed', 'Which phones are available?', true);
      await db.insert(schema.conversations).values({
        id: 'business-open',
        agencyId: 'supplier',
        connectionId: 'supplier-sender',
        contactPhone: 'central-closed',
        name: 'Customer',
        lastInboundAt: new Date(),
        lastMessageAt: new Date(),
        analysisStatus: 'complete',
      });
      await db.transaction((tx) => scheduleRecommendation(tx, 'business-open'));
      await processRecommendations(5);
      assert.equal(count('central-closed'), 0);
      await customer('business-only');
      await db.delete(schema.conversations).where(eq(schema.conversations.id, 'business-only'));
      await db.insert(schema.conversations).values({
        id: 'business-only',
        agencyId: 'supplier',
        connectionId: 'supplier-sender',
        contactPhone: 'business-only',
        name: 'Customer',
        lastInboundAt: new Date(),
        lastMessageAt: new Date(),
        analysisStatus: 'complete',
      });
      await db.insert(schema.messages).values(
        ['I want phones', 'Which phones are available?'].map((body) => ({
          id: randomUUID(),
          agencyId: 'supplier',
          connectionId: 'supplier-sender',
          contactPhone: 'business-only',
          direction: 'inbound',
          type: 'text',
          body,
          providerTimestamp: new Date(),
        })),
      );
      await db.transaction((tx) => scheduleRecommendation(tx, 'business-only'));
      await processRecommendations(5);
      assert.equal(count('business-only'), 0);
      assert.equal(
        (
          await db
            .select()
            .from(schema.recommendationJobs)
            .where(eq(schema.recommendationJobs.profileId, 'business-only'))
        ).length,
        0,
      );
    });
    await t.test(
      'central sender must be unambiguous and verified, including after work was queued',
      async () => {
        assert.equal((await centralConnection())?.id, 'origin-sender');
        await customer('central-changed');
        await inbound('central-changed', 'I want phones');
        await inbound('central-changed', 'Which phones are available?');
        await db
          .update(schema.connections)
          .set({ campaignSender: true })
          .where(eq(schema.connections.id, 'supplier-sender'));
        assert.equal(await centralConnection(), null);
        await processRecommendations(5);
        assert.equal(count('central-changed'), 0);
        await db
          .update(schema.connections)
          .set({ campaignSender: false })
          .where(eq(schema.connections.id, 'supplier-sender'));
        await db
          .update(schema.connections)
          .set({ verifiedAt: null })
          .where(eq(schema.connections.id, 'origin-sender'));
        assert.equal(await centralConnection(), null);
        await db
          .update(schema.connections)
          .set({ verifiedAt: new Date(), status: 'disabled' })
          .where(eq(schema.connections.id, 'origin-sender'));
        assert.equal(await centralConnection(), null);
        await db
          .update(schema.connections)
          .set({ status: 'receiving' })
          .where(eq(schema.connections.id, 'origin-sender'));
        assert.equal((await centralConnection())?.id, 'origin-sender');
      },
    );
    await t.test(
      'an archived linked product is excluded even when its publication flag is stale',
      async () => {
        await db.insert(schema.products).values({
          id: 'archived',
          agencyId: 'supplier',
          name: 'Archived phones',
          description: '',
          price: '10.00',
          currency: 'USD',
          active: false,
        });
        await db.insert(schema.campaigns).values({
          id: 'archived-product',
          agencyId: 'supplier',
          createdBy: 'owner',
          title: 'Archived phones',
          offerText: 'Archived phones for 10 USD.',
          locale: 'en',
          productId: 'archived',
          networkEnabled: true,
          networkExpiresAt: new Date(Date.now() + 86400000),
          status: 'ready',
        });
        await customer('archive-guard');
        await inbound('archive-guard', 'I want phones');
        await inbound('archive-guard', 'Which phones are available?');
        await processRecommendations(5);
        assert.equal(count('archive-guard'), 1);
        assert.doesNotMatch(sends.at(-1)!.text.body, /Archived phones/);
      },
    );
    await t.test(
      'a saved product is immediately recommendable and stays locked through submission',
      async () => {
        const product = await createProduct(
          { id: 'owner', platformRole: 'admin' },
          {
            agencyId: 'no-whatsapp',
            name: 'Ergonomic chairs',
            description: 'Adjustable office chairs.',
            price: '49.00',
            currency: 'USD',
            locale: 'en',
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
        );
        const [catalog] = await db
          .select()
          .from(schema.campaigns)
          .where(eq(schema.campaigns.productId, product.id));
        assert.equal(catalog.catalogOnly, true);
        assert.equal(catalog.status, 'ready');
        assert.equal(catalog.analysis, null);
        await customer('saved-catalog');
        await inbound('saved-catalog', 'I want chairs');
        await inbound('saved-catalog', 'Which chairs are available?');
        let lockChecked = false;
        duringSend = async () => {
          // Direct access inspects the one PostgreSQL backend while the external call is paused.
          // PGlite's socket multiplexing cannot model separate backend lock contention.
          const locks = await memory.query<{ relation: string; mode: string }>(
            "select relation::regclass::text as relation, mode from pg_locks where relation in ('products'::regclass, 'campaigns'::regclass, 'whatsapp_connections'::regclass)",
          );
          assert.ok(
            locks.rows.some((lock) => lock.relation === 'products' && lock.mode === 'RowShareLock'),
          );
          assert.ok(
            locks.rows.some(
              (lock) => lock.relation === 'campaigns' && lock.mode === 'RowShareLock',
            ),
          );
          assert.ok(
            locks.rows.some(
              (lock) => lock.relation === 'whatsapp_connections' && lock.mode === 'RowShareLock',
            ),
          );
          lockChecked = true;
        };
        await processRecommendations(5);
        assert.equal(
          lockChecked,
          true,
          'product and publication must stay locked through the external call',
        );
        assert.equal(count('saved-catalog'), 1);
        assert.match(sends.at(-1)!.text.body, /Ergonomic chairs/);
        assert.match(sends.at(-1)!.text.body, /49.00 USD/);
        assert.match(sends.at(-1)!.text.body, /Reply here for details/);
      },
    );
    await t.test(
      'archiving a product while AI ranks prevents submission of the stale offer',
      async () => {
        const product = await createProduct(
          { id: 'owner', platformRole: 'admin' },
          {
            agencyId: 'no-whatsapp',
            name: 'Premium chairs',
            description: 'Office chairs with arms.',
            price: '39.00',
            currency: 'USD',
            locale: 'en',
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
        );
        await customer('archive-race');
        await inbound('archive-race', 'I want chairs');
        await inbound('archive-race', 'Which chairs are available?');
        duringRank = async () => {
          await updateProduct({ id: 'owner', platformRole: 'admin' }, product.id, {
            active: false,
          });
        };
        await processRecommendations(5);
        assert.equal(count('archive-race'), 0);
        const [catalog] = await db
          .select()
          .from(schema.campaigns)
          .where(eq(schema.campaigns.productId, product.id));
        assert.equal(catalog.networkEnabled, false);
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
      const catalogs = await db
        .select()
        .from(schema.campaigns)
        .where(eq(schema.campaigns.catalogOnly, true));
      assert.ok(
        catalogs.every((offer) => offer.status === 'ready' && offer.dueAt === null),
        'topic preferences do not queue manual audience matching for catalog offers',
      );
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
    await t.test(
      'exhausted requests wait for a new business offer, survive other topics, and send only once',
      async () => {
        await customer('waiting-camera');
        await inbound('waiting-camera', 'camera offers');
        await processRecommendations(50);
        await inbound('waiting-camera', 'more offers');
        await processRecommendations(50);
        assert.equal(count('waiting-camera'), 2);
        assert.match(
          sends.filter((s) => s.to === 'waiting-camera').at(-1)!.text.body,
          /keep your request open/,
        );
        const [waiting] = await db
          .select()
          .from(schema.recommendationJobs)
          .where(
            and(
              eq(schema.recommendationJobs.profileId, 'waiting-camera'),
              eq(schema.recommendationJobs.status, 'waiting'),
            ),
          );
        assert.ok(waiting.noticeMessageId);
        assert.equal(waiting.messageId, null);
        const aiCalls = rankingInputs.filter(
          (i) => i.latestMessageId === waiting.triggerMessageId,
        ).length;
        await wakeWaitingRecommendations();
        await processRecommendations(50);
        assert.equal(
          rankingInputs.filter((i) => i.latestMessageId === waiting.triggerMessageId).length,
          aiCalls,
          'unchanged inventory needs no AI',
        );
        await inbound('waiting-camera', 'I want bikes');
        await processRecommendations(50);
        const product = await createProduct(
          { id: 'owner', platformRole: 'admin' },
          {
            agencyId: 'no-whatsapp',
            name: 'New camera offer',
            description: 'Camera for 800000 IQD',
            price: '800000',
            currency: 'IQD',
            locale: 'en',
          },
        );
        await Promise.all([processRecommendations(50), processRecommendations(50)]);
        assert.equal(
          count('waiting-camera'),
          3,
          'one newly available camera, despite later bike inquiry',
        );
        assert.match(sends.filter((s) => s.to === 'waiting-camera').at(-1)!.text.body, /800000/);
        await updateProduct({ id: 'owner', platformRole: 'admin' }, product.id, {
          price: '790000',
        });
        await processRecommendations(50);
        assert.equal(count('waiting-camera'), 3, 'saving more offers cannot grant another send');
        const [done] = await db
          .select()
          .from(schema.recommendationJobs)
          .where(eq(schema.recommendationJobs.id, waiting.id));
        assert.equal(done.status, 'accepted');
        assert.equal(done.waitingForOffer, false);
        assert.ok(done.noticeMessageId && done.messageId);
        await updateProduct({ id: 'owner', platformRole: 'admin' }, product.id, { active: false });
      },
    );
    await t.test(
      'unmatched requests remain quiet and topic/global stops remove their permission',
      async () => {
        await customer('wait-stop');
        await customer('wait-delete');
        await inbound('wait-stop', 'camera offers');
        await inbound('wait-delete', 'camera offers');
        await processRecommendations(50);
        await inbound('wait-stop', 'more offers');
        await inbound('wait-delete', 'more offers');
        await processRecommendations(50);
        const before = count('wait-stop');
        const unrelated = await createProduct(
          { id: 'owner', platformRole: 'admin' },
          {
            agencyId: 'supplier',
            name: 'Office chairs',
            description: 'Office chairs',
            price: '20',
          },
        );
        await processRecommendations(50);
        assert.equal(
          count('wait-stop'),
          before,
          'unrelated catalog changes do not repeat the notice',
        );
        await webhook('wait-stop', 'STOP OFFER');
        await webhook('wait-delete', 'STOP ALL');
        const matching = await createProduct(
          { id: 'owner', platformRole: 'admin' },
          { agencyId: 'supplier', name: 'Camera deal', description: 'Camera', price: '100' },
        );
        await processRecommendations(50);
        assert.equal(count('wait-stop'), before + 1, 'only the stop acknowledgement');
        assert.equal(count('wait-delete'), 2, 'no later recommendation after deletion');
        assert.equal(
          (
            await db
              .select()
              .from(schema.recommendationJobs)
              .where(eq(schema.recommendationJobs.profileId, 'wait-delete'))
          ).length,
          0,
        );
        await updateProduct({ id: 'owner', platformRole: 'admin' }, unrelated.id, {
          active: false,
        });
        await updateProduct({ id: 'owner', platformRole: 'admin' }, matching.id, { active: false });
      },
    );
    await t.test('late offers wait for an approved template outside the reply window', async () => {
      await customer('wait-template');
      await inbound('wait-template', 'camera offers');
      await processRecommendations(50);
      await inbound('wait-template', 'more offers');
      await processRecommendations(50);
      await db
        .update(schema.conversations)
        .set({ lastInboundAt: new Date(Date.now() - 25 * 3600000) })
        .where(eq(schema.conversations.id, 'wait-template'));
      const product = await createProduct(
        { id: 'owner', platformRole: 'admin' },
        { agencyId: 'supplier', name: 'New camera sale', description: 'Camera', price: '300' },
      );
      await processRecommendations(50);
      assert.equal(count('wait-template'), 2, 'no free text after window closure');
      const [pendingTemplate] = await db
        .select()
        .from(schema.recommendationJobs)
        .where(
          and(
            eq(schema.recommendationJobs.profileId, 'wait-template'),
            eq(schema.recommendationJobs.status, 'templatePending'),
          ),
        );
      assert.ok(pendingTemplate);
      templateStatus = 'APPROVED';
      await db
        .update(schema.sharedProfiles)
        .set({ updatedAt: new Date() })
        .where(eq(schema.sharedProfiles.id, 'wait-template'));
      await db
        .update(schema.recommendationJobs)
        .set({ dueAt: new Date(Date.now() - 1000) })
        .where(eq(schema.recommendationJobs.id, pendingTemplate.id));
      await processRecommendations(50);
      assert.equal(
        count('wait-template'),
        2,
        'changed profile requires a fresh match without consuming the request',
      );
      await wakeWaitingRecommendations();
      await processRecommendations(50);
      assert.equal(count('wait-template'), 3);
      const [delivered] = await db
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.requestId, pendingTemplate.id));
      assert.equal(delivered.type, 'template');
      assert.equal(delivered.deliveryStatus, 'accepted');
      await wakeWaitingRecommendations();
      await processRecommendations(50);
      assert.equal(count('wait-template'), 3);
      await updateProduct({ id: 'owner', platformRole: 'admin' }, product.id, { active: false });
    });
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
