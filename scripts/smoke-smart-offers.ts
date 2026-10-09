import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, inArray } from 'drizzle-orm';
import { getDb, getPool } from '../src/db';
import * as schema from '../src/db/schema';
import { encrypt } from '../src/lib/security';
import { ingestWebhook } from '../src/lib/webhook';
import { processConsentReplies } from '../src/lib/consent';
import { processPendingAnalysis } from '../src/lib/analysis';
import { processRecommendations } from '../src/lib/recommendations';
import { openRouterModel } from '../src/lib/anthropic';

// Explicit opt-in: this spends a small amount on real AI. Meta is always mocked;
// all records live in a disposable database, never the application's database.
if (!process.argv.includes('--live-ai'))
  throw new Error('Pass --live-ai to run the isolated real-AI smoke test.');
if (!/^sk-or-v1-[a-f0-9]{50,}$/i.test(process.env.OPENROUTER_API_KEY || ''))
  throw new Error('Set a real OPENROUTER_API_KEY in this process before running.');
process.env.OPENROUTER_MODEL = openRouterModel;
process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54339/postgres';
process.env.AUTOMATION_DISABLED = 'true';
process.env.CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString('hex');
delete process.env.VERCEL;

const memory = await PGlite.create();
const server = new PGLiteSocketServer({
  db: memory,
  host: '127.0.0.1',
  port: 54339,
  maxConnections: 5,
});
await server.start();
const db = getDb();
const phone = '9647000000039';
const secret = randomBytes(32).toString('hex');
const originalFetch = globalThis.fetch;
const sent: string[] = [];
const models = new Set<string>();
let aiCalls = 0;
let lastAi: unknown;
globalThis.fetch = async (url, init) => {
  const endpoint = String(url);
  if (endpoint === 'https://openrouter.ai/api/v1/chat/completions') {
    aiCalls++;
    const response = await originalFetch(url, init);
    if (response.ok) {
      const body = await response.clone().json();
      if (body.model) models.add(body.model);
      lastAi = {
        model: body.model,
        finishReason: body.choices?.[0]?.finish_reason,
        output: body.choices?.[0]?.message?.content,
      };
    }
    return response;
  }
  assert.match(endpoint, /^https:\/\/graph\.facebook\.com\/[^/]+\/\d+\/messages$/);
  const message = JSON.parse(String(init?.body));
  assert.equal(message.to, phone);
  assert.equal(message.type, 'text');
  sent.push(message.text.body);
  return Response.json({ messages: [{ id: `isolated-meta-${sent.length}` }] });
};
const recommendationBodies = () => sent.filter((body) => body.includes('WhatsApp: https://wa.me/'));
const stage = (name: string) =>
  console.log(
    `PASS ${name} | AI calls=${aiCalls} | recommended offers=${recommendationBodies().length}`,
  );
async function inbound(body: string) {
  const raw = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '90001',
        changes: [
          {
            field: 'messages',
            value: {
              metadata: { phone_number_id: '90001' },
              contacts: [{ wa_id: phone, profile: { name: 'Isolated customer' } }],
              messages: [
                {
                  id: randomUUID(),
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
  return ingestWebhook(raw, `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`);
}
async function analyzeAndRecommend() {
  // Advance only scheduled due times; never substitute or edit an AI decision.
  for (let attempt = 0; attempt < 3; attempt++) {
    await db
      .update(schema.conversations)
      .set({ analysisDueAt: new Date(Date.now() - 1000) })
      .where(inArray(schema.conversations.analysisStatus, ['pending', 'error']));
    await processPendingAnalysis(10);
    const [conversation] = await db
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.contactPhone, phone));
    if (!conversation || conversation.analysisStatus === 'complete') break;
    if (attempt === 2)
      throw new Error(
        `AI analysis failed: ${conversation.analysisError || conversation.analysisStatus}`,
      );
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    await db
      .update(schema.recommendationJobs)
      .set({ dueAt: new Date(Date.now() - 1000) })
      .where(inArray(schema.recommendationJobs.status, ['pending', 'error']));
    await processRecommendations(10);
    const retries = await db
      .select()
      .from(schema.recommendationJobs)
      .where(eq(schema.recommendationJobs.status, 'error'));
    if (!retries.length) break;
    if (attempt === 2) throw new Error('AI recommendation ranking failed after retries.');
  }
}
try {
  await migrate(db, { migrationsFolder: './drizzle' });
  await db
    .insert(schema.user)
    .values({ id: 'owner', name: 'Test owner', email: 'isolated-owner@example.test' });
  for (const [index, id] of ['origin', 'bike-low', 'bike-high', 'flowers'].entries()) {
    await db.insert(schema.agencies).values({
      id,
      name: id,
      slug: id,
      industry: id === 'flowers' ? 'Florist' : 'General retail',
    });
    await db.insert(schema.connections).values({
      id,
      agencyId: id,
      label: id,
      phoneNumberId: String(90001 + index),
      wabaId: String(90001 + index),
      displayPhone: `+964 700 000 100${index}`,
      accessTokenEncrypted: encrypt('isolated-meta-only', `${id}:token`),
      appSecretEncrypted: encrypt(secret, `${id}:secret`),
    });
  }
  const bike = (price: number) =>
    `In-stock black CityRide 7 bicycle, 7-speed aluminum frame. Price USD ${price}. Pickup in Erbil. Includes a 12-month warranty. No extra charges.`;
  for (const [id, agencyId, title, offerText] of [
    ['cheap', 'bike-low', 'CityRide 7 bicycle', bike(180)],
    ['costly', 'bike-high', 'CityRide 7 bicycle', bike(250)],
    ['same-business', 'origin', 'CityRide 7 bicycle', bike(100)],
    [
      'flower',
      'flowers',
      'Red rose bouquet',
      'In-stock bouquet of 12 fresh red roses. Price USD 20. Pickup in Erbil today. No extra charges.',
    ],
  ])
    await db.insert(schema.campaigns).values({
      id,
      agencyId,
      createdBy: 'owner',
      title,
      offerText,
      locale: 'en',
      status: 'ready',
      networkEnabled: true,
      networkExpiresAt: new Date(Date.now() + 86400000),
    });

  await inbound('Hi, I am looking for an CityRide 7 bicycle in Erbil.');
  await processConsentReplies();
  await processPendingAnalysis(10);
  assert.equal(aiCalls, 0);
  assert.ok(sent.at(-1)?.includes('Reply YES'));
  stage('first message requests consent without AI processing');

  await inbound('YES');
  await processConsentReplies();
  await analyzeAndRecommend();
  assert.equal(recommendationBodies().length, 0);
  stage('one consent enables analysis; one interest mention sends no offer');

  await inbound(
    'Can you find an in-stock black CityRide 7 bicycle in Erbil? My budget is up to USD 300 and I need a 12-month warranty.',
  );
  await analyzeAndRecommend();
  assert.equal(recommendationBodies().length, 1);
  assert.ok(recommendationBodies()[0].includes('USD 180'));
  assert.equal(recommendationBodies()[0].includes('USD 100'), false);
  stage('repeated request selects the better-priced matching offer from another business');

  await inbound(
    'I am still interested in the same CityRide 7 bicycle in Erbil with that warranty.',
  );
  await analyzeAndRecommend();
  await processRecommendations(10);
  assert.equal(recommendationBodies().length, 1);
  stage('further product interest does not send a second offer without MORE');

  await inbound('MORE');
  await analyzeAndRecommend();
  assert.equal(recommendationBodies().length, 2);
  assert.ok(recommendationBodies()[1].includes('USD 250'));
  stage('MORE returns one next unseen offer');

  await inbound('STOP OFFER');
  await processRecommendations(10);
  let [profile] = await db
    .select()
    .from(schema.sharedProfiles)
    .where(eq(schema.sharedProfiles.phone, phone));
  assert.equal(profile.status, 'active');
  assert.ok(profile.blockedTopics.length > 0);
  assert.ok(sent.at(-1)?.includes('are stopped'));
  await inbound('MORE');
  await analyzeAndRecommend();
  assert.equal(recommendationBodies().length, 2);
  stage('STOP OFFER blocks its topic while keeping the customer enrolled');

  await inbound(
    'I also want a bouquet of 12 fresh red roses for pickup in Erbil today. My budget is USD 25.',
  );
  await analyzeAndRecommend();
  await inbound('Can you find me 12 fresh red roses, a bouquet in Erbil today, within USD 25?');
  await analyzeAndRecommend();
  assert.equal(recommendationBodies().length, 3);
  assert.ok(recommendationBodies()[2].includes('12 fresh red roses'));
  [profile] = await db
    .select()
    .from(schema.sharedProfiles)
    .where(eq(schema.sharedProfiles.phone, phone));
  assert.ok(profile.blockedTopics.length > 0);
  stage('a different repeated interest still receives its matching flower offer');

  await inbound('STOP ALL');
  await processConsentReplies();
  assert.equal((await db.select().from(schema.sharedProfiles)).length, 0);
  assert.equal((await db.select().from(schema.conversations)).length, 0);
  assert.equal((await db.select().from(schema.messages)).length, 0);
  assert.equal((await db.select().from(schema.recommendationJobs)).length, 0);
  assert.equal((await db.select().from(schema.providerEvents)).length, 0);
  const callsBefore = aiCalls;
  await inbound('I would like another bicycle.');
  await analyzeAndRecommend();
  assert.equal((await db.select().from(schema.messages)).length, 0);
  assert.equal(aiCalls, callsBefore);
  stage('STOP ALL purges data and later collection stays disabled');
  console.log(`Actual models: ${[...models].join(', ')}`);
  console.log('PASS complete isolated real-AI flow; all Meta messages were mocked.');
} catch (error) {
  // Only synthetic conversation output, never request headers or credentials.
  console.log('Last synthetic AI response:', JSON.stringify(lastAi));
  throw error;
} finally {
  globalThis.fetch = originalFetch;
  await getPool().end();
  await server.stop();
  await memory.close();
}
