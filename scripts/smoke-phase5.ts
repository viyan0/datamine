import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { getPool } from '../src/db';
import { encrypt } from '../src/lib/security';
import { ingestWebhook } from '../src/lib/webhook';
import { processPendingAnalysis } from '../src/lib/analysis';
import { listConversations } from '../src/lib/inbox';
import { approvedTemplates } from '../src/lib/meta';
import {
  prepareTemplate,
  matchCampaign,
  launchCampaign,
  deliverRecipient,
  processCampaigns,
  cancelCampaign,
  listCampaigns,
} from '../src/lib/campaigns';

const base = process.env.BETTER_AUTH_URL || 'http://localhost:3000';
const databaseUrl = new URL(process.env.DATABASE_URL || 'postgresql://invalid');
if (
  new URL(base).hostname !== 'localhost' ||
  databaseUrl.hostname !== '127.0.0.1' ||
  databaseUrl.port !== '54329'
)
  throw new Error(
    'Only run against the isolated local database, with AUTOMATION_DISABLED=true on the app.',
  );
const db = getPool(),
  business = randomUUID(),
  connection = randomUUID(),
  otherBusiness = randomUUID(),
  otherConnection = randomUUID(),
  phone = `964700${Date.now().toString().slice(-6)}`,
  number = Date.now().toString(),
  secret = randomUUID();
const people = Array.from({ length: 6 }, () => randomUUID()),
  offerIds: string[] = [],
  userEmail = `phase5-${randomUUID()}@example.com`,
  ownerEmail = `phase5-owner-${randomUUID()}@example.com`;
const originalFetch = globalThis.fetch,
  originalKey = process.env.OPENROUTER_API_KEY,
  originalModel = process.env.OPENROUTER_MODEL;
let thread = '',
  category = 'Bespoke shelving',
  subject = 'walnut shelf',
  failAi = false,
  invalidMatch = false,
  sendCount = 0,
  ambiguous = false;
let waitAi: Promise<void> | null = null,
  aiEntered: (() => void) | undefined,
  aiCalls = 0,
  lastOffer = '',
  candidateIds: string[] = [];
const template = {
  id: 'test-approved',
  name: 'woodwork_offer',
  language: 'en',
  status: 'APPROVED',
  category: 'MARKETING',
  components: [
    { type: 'BODY', text: 'Custom oak desks available. Reply STOP to stop Datamine offers.' },
  ],
};
async function row(table: string, id: string) {
  return (await db.query(`select * from ${table} where id=$1`, [id])).rows[0];
}
async function request(path: string, method = 'GET', body?: unknown, cookie = '') {
  const r = await originalFetch(base + path, {
    method,
    headers: { Origin: base, 'Content-Type': 'application/json', Cookie: cookie },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; '),
  };
}
async function webhook(text: string, id: string = randomUUID()) {
  const raw = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: number,
        changes: [
          {
            field: 'messages',
            value: {
              metadata: { phone_number_id: number },
              messages: [
                {
                  id,
                  from: phone,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  });
  return ingestWebhook(raw, 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex'));
}
async function runAnalysis() {
  await db.query("update conversations set analysis_due_at='2000-01-01' where id=$1", [thread]);
  await processPendingAnalysis(1);
  return row('conversations', thread);
}
async function newOffer(owner: string) {
  const r = await request(
    '/api/campaigns',
    'POST',
    {
      agencyId: business,
      title: 'Woodwork offer',
      offerText: 'Custom oak desks available this week.',
      locale: 'en',
    },
    owner,
  );
  assert.equal(r.status, 201, JSON.stringify(r.data));
  offerIds.push(r.data.id);
  return r.data.id as string;
}
async function readyOffer(owner: string) {
  const id = await newOffer(owner);
  await prepareTemplate(id, template.id);
  await matchCampaign(id);
  assert.equal((await row('campaigns', id)).status, 'ready');
  return id;
}
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url === 'https://openrouter.ai/api/v1/chat/completions') {
    aiCalls++;
    if (failAi) return Response.json({}, { status: 429 });
    const payload = JSON.parse(String(init?.body)),
      source = JSON.parse(payload.messages[1].content);
    assert.equal(payload.model, 'anthropic/claude-haiku-5.5');
    assert.equal(payload.tools, undefined);
    aiEntered?.();
    if (waitAi) await waitAi;
    let result;
    if (source.customers) {
      assert.ok(
        source.customers.every(
          (p: Record<string, unknown>) =>
            !('phone' in p) && !('name' in p) && !('messages' in p) && !('note' in p),
        ),
      );
      assert.ok(
        source.customers.every(
          (p: { interests: string[]; blockedTopics: unknown }) =>
            Array.isArray(p.blockedTopics) &&
            !p.interests.includes('Other business private interest'),
        ),
      );
      assert.match(payload.messages[0].content, /blockedTopics override interests/);
      candidateIds = source.customers.map((p: { id: string }) => p.id);
      lastOffer = source.offer;
      result = {
        summary: 'Custom woodwork offer.',
        categories: ['Custom woodworking'],
        matches: invalidMatch
          ? [{ id: 'invented-customer', reason: 'invalid' }]
          : source.customers
              .filter((p: { id: string }) => p.id === people[0])
              .map((p: { id: string }) => ({
                id: p.id,
                reason: 'Customer explicitly requested custom woodwork.',
              })),
      };
    } else {
      assert.ok(!JSON.stringify(source).includes('PRIVATE NOTE'));
      assert.ok(!JSON.stringify(source).includes(phone));
      const m = source.messages.findLast((m: { body: string }) => m.body.includes(subject));
      assert.ok(m);
      const fact = { value: subject, quote: subject, messageId: m.id };
      result = {
        language: 'en',
        services: [category, 'Custom woodworking'],
        intent: 'Custom order inquiry',
        inquiryStatus: 'inProgress',
        summary: 'Customer requests bespoke woodwork.',
        nextStep: 'Check the requested material.',
        reviewNote: null,
        subject: fact,
        facts: [{ label: 'Requested finish', ...fact }],
        stopOffers: null,
      };
    }
    return Response.json({
      model: 'anthropic/claude-haiku-5.5',
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }],
      usage: { prompt_tokens: 100, completion_tokens: 100 },
    });
  }
  if (url.startsWith('https://graph.facebook.com/') && url.includes('/message_templates')) {
    return Response.json({
      data: [
        template,
        { ...template, id: 'pending', status: 'PENDING' },
        { ...template, id: 'variable', components: [{ type: 'BODY', text: 'Hello {{1}}' }] },
        {
          ...template,
          id: 'media',
          components: [{ type: 'HEADER', format: 'IMAGE' }, ...template.components],
        },
      ],
    });
  }
  if (
    url ===
    `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v23.0'}/${number}/messages`
  ) {
    sendCount++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.to, phone);
    assert.equal(body.type, 'template');
    assert.equal(body.template.name, template.name);
    assert.equal(body.template.language.code, 'en');
    assert.ok(body.biz_opaque_callback_data);
    if (ambiguous) throw new Error('Simulated lost response');
    return Response.json({ messages: [{ id: `wamid.phase5.${sendCount}` }] });
  }
  throw new Error(`Unexpected network request blocked: ${new URL(url).origin}`);
};
try {
  process.env.OPENROUTER_API_KEY = 'mock-only';
  process.env.OPENROUTER_MODEL = 'anthropic/claude-haiku-5.5';
  const login = await request('/api/auth/sign-in/email', 'POST', {
    email: process.env.BOOTSTRAP_ADMIN_EMAIL,
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
  });
  assert.equal(login.status, 200);
  const owner = login.cookie;
  const user = (
    await db.query('select id from users where email=$1', [process.env.BOOTSTRAP_ADMIN_EMAIL])
  ).rows[0];
  await db.query(
    "insert into agencies(id,name,slug,industry,categories) values($1,'Woodworking demo',$1,'Woodworking','[]')",
    [business],
  );
  await db.query("insert into memberships(id,agency_id,user_id,role) values($1,$2,$3,'owner')", [
    randomUUID(),
    business,
    user.id,
  ]);
  await db.query(
    "insert into whatsapp_connections(id,agency_id,label,phone_number_id,waba_id,display_phone,access_token_encrypted,app_secret_encrypted,campaign_sender) values($1,$2,'Test sender',$3,$3,$4,$5,$6,false)",
    [
      connection,
      business,
      number,
      phone,
      encrypt('mock-token', `${connection}:token`),
      encrypt(secret, `${connection}:secret`),
    ],
  );
  await db.query("insert into agencies(id,name,slug) values($1,'Other business',$1)", [
    otherBusiness,
  ]);
  await db.query(
    "insert into whatsapp_connections(id,agency_id,label,phone_number_id,waba_id,display_phone,access_token_encrypted,app_secret_encrypted) values($1,$2,'Other sender',$3,$3,$4,$5,$6)",
    [
      otherConnection,
      otherBusiness,
      number + '9',
      phone + '4',
      encrypt('mock-token', `${otherConnection}:token`),
      encrypt(secret, `${otherConnection}:secret`),
    ],
  );
  assert.equal((await request('/api/campaigns')).status, 401);
  const invite = await request(
    '/api/invitations',
    'POST',
    { agencyId: business, email: userEmail, role: 'viewer', locale: 'en' },
    owner,
  );
  const pass = `Test-${randomUUID()}`;
  assert.equal(
    (
      await request('/api/invitations/accept', 'POST', {
        token: new URL(invite.data.url).hash.slice(1),
        name: 'Phase 5 viewer',
        password: pass,
      })
    ).status,
    200,
  );
  const viewerLogin = await request('/api/auth/sign-in/email', 'POST', {
    email: userEmail,
    password: pass,
  });
  assert.equal(viewerLogin.status, 200, viewerLogin.data.message || 'Viewer sign-in failed');
  assert.ok(viewerLogin.cookie);
  const viewer = viewerLogin.cookie;
  const ownerInvite = await request(
    '/api/invitations',
    'POST',
    { agencyId: business, email: ownerEmail, role: 'owner', locale: 'en' },
    owner,
  );
  assert.equal(ownerInvite.status, 201);
  assert.equal(
    (
      await request('/api/invitations/accept', 'POST', {
        token: new URL(ownerInvite.data.url).hash.slice(1),
        name: 'Business owner',
        password: pass,
      })
    ).status,
    200,
  );
  const businessOwnerLogin = await request('/api/auth/sign-in/email', 'POST', {
    email: ownerEmail,
    password: pass,
  });
  assert.equal(businessOwnerLogin.status, 200);
  const businessOwner = businessOwnerLogin.cookie;

  assert.equal(
    (
      await request(
        '/api/campaigns',
        'POST',
        {
          agencyId: business,
          title: 'No access',
          offerText: 'Not allowed to submit.',
          locale: 'en',
        },
        viewer,
      )
    ).status,
    403,
  );
  assert.equal((await request('/api/campaigns/setup', 'GET', undefined, viewer)).status, 403);
  assert.equal(
    (await request('/api/campaigns/setup', 'POST', { id: connection }, viewer)).status,
    403,
  );
  await db.query(
    "insert into customer_consents(phone,status,locale,notice_version,notice_at,last_inbound_at,reply_connection_id,reply_message_id,reply_status) values ($1,'accepted','en','test',now()-interval '1 minute',now(),$2,$3,'read')",
    [phone, connection, randomUUID()],
  );
  assert.equal(await webhook('I need a walnut shelf.', 'dedupe-phase5-' + connection), 1);
  thread = (await db.query('select id from conversations where connection_id=$1', [connection]))
    .rows[0].id;
  let c = await row('conversations', thread);
  assert.equal(c.analysis_status, 'pending');
  assert.ok(c.analysis_due_at);
  assert.equal(await webhook('I need a walnut shelf.', 'dedupe-phase5-' + connection), 0);
  assert.equal((await row('conversations', thread)).analysis_revision, c.analysis_revision);
  c = await runAnalysis();
  assert.equal(c.analysis_status, 'complete');
  assert.equal(c.service, 'Bespoke shelving');
  assert.equal(c.destination, 'walnut shelf');
  assert.equal(c.inquiry_status, 'inProgress');
  assert.equal(c.analysis.result.facts[0].label, 'Requested finish');
  assert.deepEqual(
    (await listConversations(business)).find((item) => item.id === thread)?.categories,
    ['Bespoke shelving', 'Custom woodworking'],
    'Inbox exposes dynamically generated categories from the current analysis version',
  );
  const count = aiCalls;
  await runAnalysis();
  assert.equal(aiCalls, count, 'Unchanged webhook input never calls Haiku twice');
  const threadPath = `/api/agencies/${business}/conversations/${thread}`;
  assert.equal(
    (
      await request(
        threadPath,
        'PATCH',
        { service: 'Staff correction', note: 'PRIVATE NOTE' },
        owner,
      )
    ).status,
    200,
  );
  category = 'Made to measure desks';
  subject = 'oak desk';
  await webhook('Actually I need an oak desk.');
  c = await runAnalysis();
  assert.equal(c.service, 'Staff correction');
  assert.equal(c.destination, 'oak desk');
  assert.equal(c.note, 'PRIVATE NOTE');
  assert.equal((await request(threadPath, 'PATCH', { automatic: true }, owner)).status, 200);
  c = await runAnalysis();
  assert.equal(c.service, category);
  assert.deepEqual(c.manual_fields, []);
  await webhook('Please check the oak desk finish.');
  failAi = true;
  c = await runAnalysis();
  assert.equal(c.analysis_status, 'error');
  assert.equal(c.service, category);
  assert.ok(c.analysis_due_at.getTime() > Date.now());
  failAi = false;
  c = await runAnalysis();
  assert.equal(c.analysis_status, 'complete');
  await webhook('An oak desk, please.');
  let release!: () => void;
  waitAi = new Promise<void>((r) => {
    release = r;
  });
  const entered = new Promise<void>((r) => {
    aiEntered = r;
  });
  const running = runAnalysis();
  await entered;
  await webhook('Please confirm stock for an oak desk.');
  release();
  await running;
  waitAi = null;
  aiEntered = undefined;
  assert.equal(
    (await row('conversations', thread)).analysis_status,
    'pending',
    'New inbound data supersedes in-flight analysis',
  );
  await runAnalysis();
  await db.query(
    "update conversations set analysis_run_id='abandoned',analysis_started_at=now()-interval '2 minutes' where id=$1",
    [thread],
  );
  await webhook('Is that oak desk available?');
  c = await runAnalysis();
  assert.equal(c.analysis_status, 'complete');
  assert.equal(c.analysis_run_id, null);

  // Keep the profile created by consent and analysis, then add isolated exclusion fixtures.
  people[0] = (await db.query('select id from shared_profiles where phone=$1', [phone])).rows[0].id;
  await db.query(
    'update shared_profiles set interests=\'["Other business private interest"]\',updated_at=now() where id=$1',
    [people[0]],
  );
  for (let i = 1; i < people.length; i++) {
    const customerPhone = phone + String(i);
    await db.query(
      "insert into shared_profiles(id,phone,name,language,interests,destination,status,offer_hold,consent_version,consent_at) values($1,$2,$3,$4,'[\"Other business private interest\"]','Private request',$5,$6,'test',now())",
      [
        people[i],
        customerPhone,
        'Test customer ' + i,
        i === 3 ? 'ar' : 'en',
        i === 1 ? 'optedOut' : 'active',
        i === 2,
      ],
    );
    const customerConnection = i === 4 ? otherConnection : connection;
    await db.query(
      "insert into customer_consents(phone,status,locale,notice_version,notice_at,last_inbound_at,reply_connection_id,reply_message_id,reply_status) values($1,$2,'en','test',now(),now(),$3,$4,'read')",
      [customerPhone, i === 5 ? 'pending' : 'accepted', customerConnection, randomUUID()],
    );
    await db.query(
      'insert into conversations(id,agency_id,connection_id,contact_phone,name,analysis,last_inbound_at,last_message_at) values($1,$2,$3,$4,$5,$6,now(),now())',
      [
        randomUUID(),
        i === 4 ? otherBusiness : business,
        customerConnection,
        customerPhone,
        'Test customer ' + i,
        c.analysis,
      ],
    );
  }
  const foreignOffer = randomUUID();
  offerIds.push(foreignOffer);
  await db.query(
    "insert into campaigns(id,agency_id,created_by,title,offer_text,locale,status) values($1,$2,$3,'Other offer','Private business offer','en','cancelled')",
    [foreignOffer, otherBusiness, user.id],
  );
  assert.equal(
    (await approvedTemplates(number, 'mock-token')).length,
    1,
    'Only approved simple marketing templates are offered',
  );
  const first = await newOffer(businessOwner);
  await matchCampaign(first);
  assert.equal((await row('campaigns', first)).status, 'ready');
  assert.ok(candidateIds.includes(people[0]));
  assert.ok(!candidateIds.includes(people[1]));
  assert.ok(!candidateIds.includes(people[2]));
  assert.ok(!candidateIds.includes(people[3]));
  assert.ok(!candidateIds.includes(people[4]), 'Other business contacts never enter this audience');
  assert.ok(!candidateIds.includes(people[5]), 'Pending consent never enters this audience');
  await prepareTemplate(first, template.id);
  assert.equal((await row('campaigns', first)).status, 'matching');
  await matchCampaign(first);
  assert.equal(
    lastOffer,
    template.components[0].text,
    'Match actual approved message, not just submitted offer',
  );
  const scoped = (await listCampaigns([business], false)).find((offer) => offer.id === first)!;
  assert.deepEqual(
    scoped.recipients?.map((person) => person.phone),
    [phone],
  );
  assert.ok(scoped.analysis);
  assert.ok(
    !scoped.recipients?.some((person) =>
      person.interests.includes('Other business private interest'),
    ),
  );
  assert.deepEqual(await listCampaigns([], false), []);
  assert.equal(
    (await request(`/api/campaigns/${first}`, 'POST', { action: 'send' }, viewer)).status,
    403,
  );
  assert.equal(
    (await request(`/api/campaigns/setup?campaignId=${first}`, 'GET', undefined, viewer)).status,
    403,
  );
  assert.equal(
    (await request(`/api/campaigns/${foreignOffer}`, 'POST', { action: 'cancel' }, businessOwner))
      .status,
    403,
  );
  assert.equal(
    (
      await request(
        `/api/campaigns/setup?campaignId=${foreignOffer}`,
        'GET',
        undefined,
        businessOwner,
      )
    ).status,
    403,
  );
  const privateList = await request('/api/campaigns', 'GET', undefined, businessOwner);
  assert.ok(privateList.data.campaigns.some((offer: { id: string }) => offer.id === first));
  assert.ok(!privateList.data.campaigns.some((offer: { id: string }) => offer.id === foreignOffer));
  assert.ok(!JSON.stringify(privateList.data).includes(phone + '4'));
  const visibleOwn = privateList.data.campaigns.find((offer: { id: string }) => offer.id === first);
  assert.equal(
    visibleOwn.recipients[0].phone,
    phone,
    'Business owners can see their own customer contacts',
  );
  assert.equal(
    (
      await request(
        `/api/campaigns/${first}`,
        'POST',
        {
          action: 'network',
          enabled: true,
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
        businessOwner,
      )
    ).status,
    200,
  );
  assert.equal((await row('campaigns', first)).network_enabled, true);
  assert.equal(
    (
      await request(
        `/api/campaigns/${first}`,
        'POST',
        { action: 'network', enabled: false },
        businessOwner,
      )
    ).status,
    200,
  );
  assert.equal((await row('campaigns', first)).network_enabled, false);
  await db.query('update shared_profiles set updated_at=now() where id=$1', [people[0]]);
  await assert.rejects(launchCampaign(first), { code: 'audienceChanged' });
  assert.equal((await row('campaigns', first)).status, 'matching');
  await matchCampaign(first);
  await launchCampaign(first);
  await assert.rejects(launchCampaign(first), { code: 'campaignNotReady' });
  let recipient = (
    await db.query('select * from campaign_recipients where campaign_id=$1', [first])
  ).rows[0];
  await db.query("update shared_profiles set status='optedOut',updated_at=now() where id=$1", [
    people[0],
  ]);
  await deliverRecipient(recipient.id);
  assert.equal(sendCount, 0);
  assert.equal((await row('campaign_recipients', recipient.id)).status, 'cancelled');
  await db.query("update shared_profiles set status='active',updated_at=now() where id=$1", [
    people[0],
  ]);
  const successful = await readyOffer(owner);
  await launchCampaign(successful);
  recipient = (
    await db.query('select * from campaign_recipients where campaign_id=$1', [successful])
  ).rows[0];
  await Promise.all([deliverRecipient(recipient.id), deliverRecipient(recipient.id)]);
  assert.equal(sendCount, 1);
  assert.equal((await row('campaign_recipients', recipient.id)).status, 'accepted');
  const message = (await row('campaign_recipients', recipient.id)).message_id;
  for (const status of ['read', 'sent']) {
    const raw = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: number,
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: number },
                statuses: [
                  {
                    id: 'wamid.phase5.1',
                    status,
                    timestamp: String(Date.now() / 1000),
                    biz_opaque_callback_data: message,
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    await ingestWebhook(raw, 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex'));
  }
  assert.equal((await row('messages', message)).delivery_status, 'read');
  const uncertain = await readyOffer(owner);
  await launchCampaign(uncertain);
  recipient = (
    await db.query('select * from campaign_recipients where campaign_id=$1', [uncertain])
  ).rows[0];
  ambiguous = true;
  await deliverRecipient(recipient.id);
  await deliverRecipient(recipient.id);
  assert.equal(sendCount, 2);
  assert.equal((await row('campaign_recipients', recipient.id)).status, 'uncertain');
  ambiguous = false;
  const cancelled = await readyOffer(owner);
  await launchCampaign(cancelled);
  await cancelCampaign(cancelled);
  await processCampaigns();
  assert.equal(sendCount, 2);
  const invalid = await newOffer(owner);
  invalidMatch = true;
  await matchCampaign(invalid);
  assert.equal((await row('campaigns', invalid)).error, 'analysisInvalid');
  invalidMatch = false;
  await cancelCampaign(invalid);
  await webhook('DELETE MY DATA');
  assert.equal(
    await row('shared_profiles', people[0]),
    undefined,
    'Global withdrawal removes the profile',
  );
  assert.equal(await row('conversations', thread), undefined, 'Global withdrawal removes chats');
  assert.equal(
    (await db.query('select id from recommendation_jobs where profile_id=$1', [people[0]]))
      .rowCount,
    0,
    'Global withdrawal removes recommendation jobs',
  );
  await webhook('Thanks for your help with the oak desk.');
  assert.equal(
    (await db.query('select status from customer_consents where phone=$1', [phone])).rows[0].status,
    'declined',
    'Analysis cannot grant consent',
  );
  // A fresh explicit YES can rejoin; the deleted history cannot override it.
  await db.query(
    "update customer_consents set decision_at=now()-interval '1 minute' where phone=$1",
    [phone],
  );
  await webhook('YES');
  assert.equal(
    (await db.query('select status from shared_profiles where phone=$1', [phone])).rows[0].status,
    'active',
  );
  await db.query('update whatsapp_connections set campaign_sender=false where id=$1', [connection]);
  delete process.env.OPENROUTER_API_KEY;
  await webhook('STOP');
  assert.equal(
    (await db.query('select id from shared_profiles where phone=$1', [phone])).rowCount,
    0,
    'STOP works without AI on any connected inbox',
  );
  const stale = await newOffer(owner);
  await db.query("update campaigns set status='sending' where id=$1", [stale]);
  const rid = randomUUID();
  await db.query(
    "insert into campaign_recipients(id,campaign_id,profile_id,profile_updated_at,reason,status,submitted_at) values($1,$2,$3,now(),'test','submitting',now()-interval '2 minutes')",
    [rid, stale, people[1]],
  );
  await processCampaigns();
  assert.equal((await row('campaign_recipients', rid)).status, 'uncertain');
  assert.equal(sendCount, 2);
  console.log(
    'PASS: automatic analysis, open categories/facts, evidence, dedupe/cache, manual overrides, source races, retries/recovery, campaign roles/privacy, actual-template matching, consent/language suppression, profile changes, delivery dedupe/callbacks/uncertainty, cancellation, global deletion and offline STOP. All provider calls mocked.',
  );
} finally {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.OPENROUTER_MODEL;
  else process.env.OPENROUTER_MODEL = originalModel;
  const cleanupProfiles = [
    ...new Set([
      ...people,
      ...(
        await db.query('select id from shared_profiles where phone=any($1::text[])', [
          people.map((_, i) => (i ? phone + String(i) : phone)),
        ])
      ).rows.map((profile) => profile.id as string),
    ]),
  ];
  await db.query(
    'delete from recommendation_jobs where profile_id=any($1::text[]) or conversation_id in (select id from conversations where connection_id=any($2::text[]))',
    [cleanupProfiles, [connection, otherConnection]],
  );
  await db.query('delete from campaign_recipients where campaign_id=any($1::text[])', [offerIds]);
  await db.query('delete from campaigns where id=any($1::text[])', [offerIds]);
  await db.query('delete from profile_events where profile_id=any($1::text[])', [cleanupProfiles]);
  await db.query('delete from shared_profiles where id=any($1::text[])', [cleanupProfiles]);
  await db.query(
    'delete from enrollment_links where conversation_id in (select id from conversations where connection_id=any($1::text[]))',
    [[connection, otherConnection]],
  );
  await db.query('delete from messages where connection_id=any($1::text[])', [
    [connection, otherConnection],
  ]);
  await db.query('delete from provider_events where connection_id=any($1::text[])', [
    [connection, otherConnection],
  ]);
  await db.query('delete from conversations where connection_id=any($1::text[])', [
    [connection, otherConnection],
  ]);
  await db.query('delete from customer_consents where reply_connection_id=any($1::text[])', [
    [connection, otherConnection],
  ]);
  await db.query('delete from whatsapp_connections where id=any($1::text[])', [
    [connection, otherConnection],
  ]);
  await db.query('delete from invitations where agency_id=any($1::text[])', [
    [business, otherBusiness],
  ]);
  await db.query('delete from audit_events where agency_id=any($1::text[])', [
    [business, otherBusiness],
  ]);
  await db.query('delete from agencies where id=any($1::text[])', [[business, otherBusiness]]);
  await db.query('delete from users where email=any($1::text[])', [[userEmail, ownerEmail]]);
  await db.end();
}
