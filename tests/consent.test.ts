import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { getPool } from '../src/db';
import { encrypt } from '../src/lib/security';
import { ingestWebhook } from '../src/lib/webhook';
import { consentChoice, processConsentReplies } from '../src/lib/consent';
import { processPendingAnalysis } from '../src/lib/analysis';
import { matchCampaign } from '../src/lib/campaigns';

test('one WhatsApp consent connects AI interests to existing offers; decline purges and blocks collection', async () => {
  const local = await PGlite.create();
  for (const file of (await readdir('./drizzle')).filter((f) => f.endsWith('.sql')).sort())
    await local.exec(await readFile(`./drizzle/${file}`, 'utf8'));
  const server = new PGLiteSocketServer({
    db: local,
    host: '127.0.0.1',
    port: 54331,
    maxConnections: 10,
  });
  await server.start();
  process.env.DATABASE_URL = 'postgres://postgres:postgres@127.0.0.1:54331/postgres';
  process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('hex');
  process.env.OPENROUTER_API_KEY = 'mock-only';
  process.env.OPENROUTER_MODEL = 'anthropic/claude-haiku-5.5';
  const db = getPool(),
    originalFetch = globalThis.fetch,
    secret = 'test-secret';
  const sent: { text: { body: string }; biz_opaque_callback_data: string }[] = [];
  let aiCalls = 0;
  let duringAnalysis: (() => Promise<void>) | undefined;
  const record = async (table: string, phone = '9647000000001') =>
    (
      await db.query(
        `select * from ${table} where ${table === 'conversations' ? 'contact_phone' : 'phone'}=$1`,
        [phone],
      )
    ).rows[0];
  const inbound = async (
    body: string,
    phone = '9647000000001',
    id = randomUUID(),
    number = '12345',
  ) => {
    const raw = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '67890',
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: number },
                contacts: [{ wa_id: phone, profile: { name: 'Test customer' } }],
                messages: [
                  {
                    id,
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
    return ingestWebhook(raw, 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex'));
  };
  const analyse = async () => {
    await db.query(
      "update conversations set analysis_due_at=now()-interval '1 second' where analysis_status='pending'",
    );
    await processPendingAnalysis(5);
  };
  globalThis.fetch = async (input, init) => {
    const url = String(input),
      body = JSON.parse(String(init?.body));
    if (url.startsWith('https://graph.facebook.com/') && url.endsWith('/messages')) {
      sent.push(body);
      return Response.json({ messages: [{ id: `wamid.mock.${sent.length}` }] });
    }
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    aiCalls++;
    const source = JSON.parse(body.messages[1].content);
    let result;
    if (source.customers) {
      assert.ok(source.customers.every((c: object) => !('phone' in c) && !('messages' in c)));
      result = {
        summary: 'Flowers offer',
        categories: ['Flowers'],
        matches: source.customers
          .filter((c: { interests: string[] }) => c.interests.some((i) => /flowers/i.test(i)))
          .map((c: { id: string }) => ({ id: c.id, reason: 'Customer asked for flowers.' })),
      };
    } else {
      const m = source.messages.find((m: { body: string }) => m.body.includes('flowers'));
      assert.ok(m);
      result = {
        language: 'en',
        services: ['Flowers'],
        intent: 'Flower inquiry',
        inquiryStatus: 'new',
        summary: 'Interested in flowers',
        nextStep: 'Ask which flowers',
        reviewNote: null,
        subject: { value: 'flowers', quote: 'flowers', messageId: m.id },
        facts: [],
        stopOffers: null,
      };
      await duringAnalysis?.();
    }
    return Response.json({
      model: 'anthropic/claude-haiku-5.5',
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }],
      usage: { prompt_tokens: 50, completion_tokens: 50 },
    });
  };
  try {
    await db.query(
      "insert into users(id,name,email) values ('u','Owner','owner@example.com'); insert into agencies(id,name,slug) values ('a','Business','a'),('b','Other business','b')",
    );
    for (const [id, agency, number] of [
      ['c', 'a', '12345'],
      ['d', 'b', '12346'],
    ])
      await db.query(
        "insert into whatsapp_connections(id,agency_id,label,phone_number_id,waba_id,display_phone,access_token_encrypted,app_secret_encrypted,campaign_sender,verified_at) values ($1,$2,'Test',$3,'67890','test',$4,$5,$1='c',now())",
        [id, agency, number, encrypt('mock', `${id}:token`), encrypt(secret, `${id}:secret`)],
      );
    await db.query(
      "insert into campaigns(id,agency_id,created_by,title,offer_text,locale,status) values ('offer','a','u','Flowers','Flowers offer','en','ready')",
    );
    const id = randomUUID();
    await inbound('I like flowers', undefined, id);
    await inbound('I like flowers', undefined, id);
    assert.equal((await record('conversations')).analysis_status, 'awaitingConsent');
    assert.equal(await record('shared_profiles'), undefined);
    await analyse();
    assert.equal(aiCalls, 0, 'no AI before permission');
    await processConsentReplies();
    await processConsentReplies();
    assert.equal(sent.length, 1, 'one notice despite replay and duplicate workers');
    assert.match(sent[0].text.body, /AI.*promotions/);
    await inbound('YES');
    assert.equal((await record('customer_consents')).status, 'accepted');
    assert.equal((await record('shared_profiles')).automatic_interests, true);
    await analyse();
    assert.deepEqual((await record('shared_profiles')).interests, ['flowers']);
    assert.equal((await record('shared_profiles')).offer_hold, false);
    assert.equal(
      (await db.query("select status from campaigns where id='offer'")).rows[0].status,
      'matching',
    );
    await matchCampaign('offer');
    assert.equal(
      (await db.query("select count(*)::int n from campaign_recipients where campaign_id='offer'"))
        .rows[0].n,
      1,
    );
    await processConsentReplies();
    await inbound('I like flowers too', undefined, randomUUID(), '12346');
    await processConsentReplies();
    assert.equal(sent.length, 2, 'a noncentral number cannot send consent messages');
    assert.equal(
      (await db.query("select count(*)::int n from conversations where connection_id='d'")).rows[0]
        .n,
      0,
      'noncentral inbound messages are not collected',
    );
    await inbound('YES', '9647000000003', randomUUID(), '12346');
    assert.equal(
      await record('customer_consents', '9647000000003'),
      undefined,
      'only the central number can accept consent',
    );
    await analyse();
    assert.equal(
      consentChoice('no', 'accepted'),
      null,
      'ordinary conversation no is not withdrawal',
    );
    // Withdrawal while a model request is in flight must not recreate the deleted profile.
    await inbound('More flowers please');
    duringAnalysis = async () => {
      duringAnalysis = undefined;
      await inbound('STOP');
    };
    await analyse();
    assert.equal((await record('customer_consents')).status, 'declined');
    assert.equal(await record('shared_profiles'), undefined);
    assert.equal(await record('conversations'), undefined);
    await inbound('I like flowers', undefined, id);
    await inbound('More messages after declining');
    assert.equal((await db.query('select count(*)::int n from messages')).rows[0].n, 0);
    assert.equal(
      (await db.query("select count(*)::int n from provider_events where kind='message'")).rows[0]
        .n,
      0,
    );
    assert.equal((await db.query('select count(*)::int n from campaign_recipients')).rows[0].n, 0);
    // A YES as the very first message cannot accept a notice that has not yet been shown.
    await inbound('YES', '9647000000002');
    assert.equal((await record('customer_consents', '9647000000002')).status, 'pending');
    await processConsentReplies(5);
    await inbound('NO', '9647000000002');
    await inbound('ignored', '9647000000002');
    assert.equal((await record('customer_consents', '9647000000002')).status, 'declined');
    assert.equal(await record('conversations', '9647000000002'), undefined);
  } finally {
    globalThis.fetch = originalFetch;
    await db.end();
    await server.stop();
    await local.close();
  }
});
