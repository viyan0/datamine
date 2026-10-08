import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { getPool } from '../src/db/index';
import { encrypt } from '../src/lib/security';
import { replyToConversation } from '../src/lib/inbox';
import { analyzeConversation, getAnalysisState } from '../src/lib/analysis';
const base = process.env.BETTER_AUTH_URL || 'http://localhost:3000';
if (
  new URL(base).hostname !== 'localhost' ||
  !process.env.DATABASE_URL?.includes('127.0.0.1:54329')
)
  throw new Error('Smoke fixtures may only run against the isolated local test database.');
const pool = getPool(),
  suffix = randomUUID().slice(0, 8),
  password = `Test-only-${randomUUID()}`;
async function req(path: string, method = 'GET', body?: unknown, cookie = '') {
  const r = await fetch(base + path, {
    method,
    headers: {
      Origin: base,
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: 'manual',
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return {
    status: r.status,
    data,
    cookie: r.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; '),
  };
}
async function signin(email: string, pass: string) {
  const r = await req('/api/auth/sign-in/email', 'POST', { email, password: pass });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(r.cookie);
  return r.cookie;
}
try {
  assert.equal((await req('/api/health')).status, 200);
  for (const locale of ['en', 'ar', 'ckb']) {
    const r = await req(`/${locale}/demo`);
    assert.equal(r.status, 200);
    assert.ok(r.data.includes(`dir="${locale === 'en' ? 'ltr' : 'rtl'}"`));
  }
  assert.equal(
    (await req('/api/agencies', 'POST', { name: 'No access', slug: 'no-access', locale: 'en' }))
      .status,
    401,
  );
  assert.equal(
    (
      await req('/api/auth/sign-up/email', 'POST', {
        email: `open-${suffix}@example.com`,
        name: 'Unauthorized',
        password,
      })
    ).status,
    400,
  );
  const owner = await signin(
    process.env.BOOTSTRAP_ADMIN_EMAIL!,
    process.env.BOOTSTRAP_ADMIN_PASSWORD!,
  );
  const a = await req(
    '/api/agencies',
    'POST',
    { name: `Test Agency A ${suffix}`, slug: `test-a-${suffix}`, locale: 'en' },
    owner,
  );
  const b = await req(
    '/api/agencies',
    'POST',
    { name: `Test Agency B ${suffix}`, slug: `test-b-${suffix}`, locale: 'ar' },
    owner,
  );
  assert.equal(a.status, 201, JSON.stringify(a.data));
  assert.equal(b.status, 201, JSON.stringify(b.data));
  const email = `viewer-${suffix}@example.com`;
  const invitation = await req(
    '/api/invitations',
    'POST',
    { agencyId: a.data.id, email, role: 'viewer', locale: 'en' },
    owner,
  );
  assert.equal(invitation.status, 201);
  const token = new URL(invitation.data.url).hash.slice(1);
  const accepted = await req('/api/invitations/accept', 'POST', {
    token,
    name: 'Test Viewer',
    password,
  });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
  assert.equal(
    (await req('/api/invitations/accept', 'POST', { token, name: 'Reuse', password })).status,
    400,
  );
  const viewer = await signin(email, password);
  assert.equal(
    (await req(`/api/agencies/${a.data.id}/messages`, 'GET', undefined, viewer)).status,
    200,
  );
  assert.equal(
    (await req(`/api/agencies/${b.data.id}/messages`, 'GET', undefined, viewer)).status,
    403,
  );
  assert.equal((await req('/api/setup', 'GET', undefined, viewer)).status, 403);
  assert.equal(
    (
      await req(
        '/api/agencies',
        'POST',
        { name: 'Not allowed', slug: `denied-${suffix}`, locale: 'en' },
        viewer,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await req(
        '/api/invitations',
        'POST',
        { agencyId: a.data.id, email: 'no@example.com', role: 'admin' },
        viewer,
      )
    ).status,
    403,
  );
  const page = await req('/en/app/agencies', 'GET', undefined, viewer);
  assert.equal(page.status, 200);
  assert.ok(page.data.includes(`Test Agency A ${suffix}`));
  assert.ok(!page.data.includes(`Test Agency B ${suffix}`));
  const idA = randomUUID(),
    idB = randomUUID(),
    appSecret = 'a'.repeat(32);
  for (const [id, agency, phone, waba] of [
    [idA, a.data.id, `11${Date.now()}`, '22222'],
    [idB, b.data.id, `33${Date.now()}`, '22222'],
  ]) {
    await pool.query(
      'INSERT INTO whatsapp_connections(id,agency_id,label,phone_number_id,waba_id,display_phone,access_token_encrypted,app_secret_encrypted) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        id,
        agency,
        'Local fixture',
        phone,
        waba,
        'test',
        encrypt('local-token', `${id}:token`),
        encrypt(appSecret, `${id}:secret`),
      ],
    );
  }
  const connected = await pool.query(
    'SELECT id,phone_number_id FROM whatsapp_connections WHERE id=ANY($1)',
    [[idA, idB]],
  );
  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '22222',
        changes: connected.rows.map((c) => ({
          field: 'messages',
          value: {
            metadata: { phone_number_id: c.phone_number_id },
            messages: [
              {
                id: `wamid.${c.id}`,
                from: '964000000000',
                timestamp: String(Math.floor(Date.now() / 1000)),
                type: 'text',
                text: { body: `Private for ${c.id}` },
              },
            ],
          },
        })),
      },
    ],
  };
  const raw = JSON.stringify(payload),
    sig = `sha256=${createHmac('sha256', appSecret).update(raw).digest('hex')}`;
  async function webhook(body: string, signature: string) {
    return fetch(base + '/api/webhooks/whatsapp', {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signature },
    });
  }
  assert.equal((await webhook(raw, 'sha256=' + '0'.repeat(64))).status, 401);
  assert.equal((await webhook(raw, sig)).status, 200);
  assert.equal((await webhook(raw, sig)).status, 200);
  const count = await pool.query(
    'SELECT count(*)::int AS count FROM messages WHERE connection_id=ANY($1)',
    [[idA, idB]],
  );
  assert.equal(count.rows[0].count, 2);
  const visible = await req(`/api/agencies/${a.data.id}/messages`, 'GET', undefined, viewer);
  assert.equal(visible.data.messages.length, 1);
  assert.equal(visible.data.messages[0].body, `Private for ${idA}`);
  // Phase 2: persisted customer records, scoped edits, real HTTP permissions, and mocked Meta sends.
  const threads = await req(`/api/agencies/${a.data.id}/conversations`, 'GET', undefined, viewer);
  assert.equal(threads.status, 200);
  assert.equal(threads.data.conversations.length, 1);
  const thread = threads.data.conversations[0];
  const threadPath = `/api/agencies/${a.data.id}/conversations/${thread.id}`;
  const fields = {
    name: 'Demo Customer',
    service: 'flight',
    destination: 'Erbil → Istanbul',
    inquiryStatus: 'inProgress',
    note: 'Private team note',
  };
  assert.equal((await req(threadPath, 'PATCH', fields, viewer)).status, 403);
  assert.equal(
    (await req(`${threadPath}/reply`, 'POST', { body: 'Blocked', requestId: randomUUID() }, viewer))
      .status,
    403,
  );
  assert.equal(
    (await req(`/api/agencies/${b.data.id}/conversations/${thread.id}`, 'GET', undefined, viewer))
      .status,
    403,
  );
  assert.equal(
    (await req(`/api/agencies/${b.data.id}/conversations/${thread.id}`, 'GET', undefined, owner))
      .status,
    404,
  );
  assert.equal((await req(threadPath, 'PATCH', fields, owner)).status, 200);
  const updated = await req(`/api/agencies/${a.data.id}/conversations`, 'GET', undefined, owner);
  assert.equal(updated.data.conversations[0].note, fields.note);
  assert.equal(updated.data.conversations[0].name, fields.name);
  const originalFetch = globalThis.fetch;
  let sends = 0;
  let mockStatus = 200;
  let outboundCallbackId = '';
  globalThis.fetch = async (input, init) => {
    if (!String(input).startsWith('https://graph.facebook.com/')) return originalFetch(input, init);
    sends++;
    const sent = JSON.parse(String(init?.body));
    assert.equal(sent.to, thread.contactPhone);
    assert.ok(String(input).includes(connected.rows.find((r) => r.id === idA).phone_number_id));
    outboundCallbackId = sent.biz_opaque_callback_data;
    if (mockStatus === 0) throw new Error('Simulated lost response');
    return Response.json(
      mockStatus === 200 ? { messages: [{ id: `wamid.reply-${suffix}-${sends}` }] } : { error: {} },
      { status: mockStatus },
    );
  };
  try {
    const requestId = randomUUID();
    const results = await Promise.all([
      replyToConversation(a.data.id, thread.id, 'Your flight options are ready.', requestId),
      replyToConversation(a.data.id, thread.id, 'Your flight options are ready.', requestId),
    ]);
    assert.equal(sends, 1, 'Duplicate requests must not send twice');
    assert.equal(results[0].id, results[1].id);
    assert.equal(
      (
        await req(
          `${threadPath}/reply`,
          'POST',
          { body: 'Your flight options are ready.', requestId },
          owner,
        )
      ).status,
      200,
    );
    assert.equal(
      (await req(`${threadPath}/reply`, 'POST', { body: 'Different body', requestId }, owner))
        .status,
      409,
    );
    async function delivery(status: string, providerId: string, callbackId: string) {
      const data = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '22222',
            changes: [
              {
                field: 'messages',
                value: {
                  metadata: {
                    phone_number_id: connected.rows.find((r) => r.id === idA).phone_number_id,
                  },
                  statuses: [
                    {
                      id: providerId,
                      status,
                      timestamp: String(Math.floor(Date.now() / 1000)),
                      biz_opaque_callback_data: callbackId,
                    },
                  ],
                },
              },
            ],
          },
        ],
      };
      const body = JSON.stringify(data);
      assert.equal(
        (
          await webhook(
            body,
            `sha256=${createHmac('sha256', appSecret).update(body).digest('hex')}`,
          )
        ).status,
        200,
      );
    }
    for (const state of ['read', 'delivered', 'sent', 'failed', 'read'])
      await delivery(state, `wamid.reply-${suffix}-1`, outboundCallbackId);
    const history = await req(threadPath, 'GET', undefined, viewer);
    assert.equal(
      history.data.messages.find((m: { id: string }) => m.id === results[0].id).deliveryStatus,
      'read',
    );
    mockStatus = 400;
    assert.equal(
      (await replyToConversation(a.data.id, thread.id, 'Rejected test', randomUUID()))
        .deliveryStatus,
      'failed',
    );
    mockStatus = 0;
    const uncertainId = randomUUID();
    const uncertain = await replyToConversation(a.data.id, thread.id, 'Timeout test', uncertainId);
    assert.equal(uncertain.deliveryStatus, 'uncertain');
    await replyToConversation(a.data.id, thread.id, 'Timeout test', uncertainId);
    assert.equal(sends, 3, 'Uncertain sends must not be retried');
    await delivery('delivered', `wamid.recovered-${suffix}`, outboundCallbackId);
    assert.equal(
      (await req(threadPath, 'GET', undefined, owner)).data.messages.find(
        (m: { id: string }) => m.id === uncertain.id,
      ).deliveryStatus,
      'delivered',
    );
    await pool.query(
      "UPDATE conversations SET last_inbound_at = now() - interval '25 hours' WHERE id=$1",
      [thread.id],
    );
    assert.equal(
      (
        await req(
          `${threadPath}/reply`,
          'POST',
          { body: 'Expired window', requestId: randomUUID() },
          owner,
        )
      ).status,
      409,
    );
    assert.equal(sends, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal((await req(`${threadPath}/analysis`, 'GET', undefined, viewer)).status, 200);
  assert.equal((await req(`${threadPath}/analysis`, 'POST', { locale: 'en' }, viewer)).status, 403);
  assert.equal(
    (
      await req(
        `/api/agencies/${b.data.id}/conversations/${thread.id}/analysis`,
        'GET',
        undefined,
        owner,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await req(
        `/api/agencies/${b.data.id}/conversations/${thread.id}/analysis`,
        'POST',
        { locale: 'en' },
        viewer,
      )
    ).status,
    403,
  );
  const originalKey = process.env.ANTHROPIC_API_KEY,
    originalModel = process.env.ANTHROPIC_MODEL;
  process.env.ANTHROPIC_API_KEY = 'local-test-only';
  process.env.ANTHROPIC_MODEL = 'claude-haiku-5-5';
  const evidenceId = randomUUID();
  const evidenceText = 'Two travelers need a flight and visa to Istanbul next Friday.';
  await pool.query(
    "INSERT INTO messages(id,agency_id,connection_id,provider_message_id,direction,contact_phone,type,body,provider_timestamp) VALUES($1,$2,$3,$4,'inbound',$5,'text',$6,now())",
    [evidenceId, a.data.id, idA, `wamid.ai-${suffix}`, thread.contactPhone, evidenceText],
  );
  let aiCalls = 0,
    invalid = false;
  let hold: Promise<void> | null = null;
  let entered: (() => void) | null = null;
  globalThis.fetch = async (input, init) => {
    if (String(input) !== 'https://api.anthropic.com/v1/messages')
      return originalFetch(input, init);
    aiCalls++;
    const payload = JSON.parse(String(init?.body));
    const serialized = payload.messages[0].content;
    assert.ok(serialized.includes(evidenceText));
    assert.ok(!serialized.includes(fields.note));
    assert.ok(!serialized.includes(thread.contactPhone));
    assert.ok(!serialized.includes(`Private for ${idB}`));
    entered?.();
    if (hold) await hold;
    return Response.json({
      stop_reason: 'end_turn',
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            language: 'en',
            services: ['flight', 'visa'],
            intent: 'availability',
            summary: 'Two travelers need a flight and visa to Istanbul.',
            nextStep: 'Confirm travel dates.',
            reviewNote: 'The exact date and year need confirmation.',
            facts: {
              departure: null,
              destination: {
                value: 'Istanbul',
                quote: invalid ? 'invented quote' : 'Istanbul',
                messageId: evidenceId,
              },
              travelDates: { value: 'next Friday', quote: 'next Friday', messageId: evidenceId },
              travelers: { value: 'Two', quote: 'Two travelers', messageId: evidenceId },
              budget: null,
            },
          }),
        },
      ],
      usage: { input_tokens: 200, output_tokens: 150 },
    });
  };
  try {
    const analysis = await analyzeConversation(a.data.id, thread.id, 'en');
    assert.equal(analysis.model, 'claude-haiku-5-5');
    assert.deepEqual(analysis.result.services, ['flight', 'visa']);
    await analyzeConversation(a.data.id, thread.id, 'en');
    assert.equal(aiCalls, 1, 'Unchanged inputs reuse the saved analysis');
    const persisted = await req(`${threadPath}/analysis`, 'GET', undefined, viewer);
    assert.equal(persisted.data.analysis.result.facts.destination.value, 'Istanbul');
    assert.equal(persisted.data.stale, false);
    assert.equal(
      (await req(`${threadPath}/analysis`, 'POST', { locale: 'en' }, owner)).status,
      200,
    );
    invalid = true;
    await assert.rejects(analyzeConversation(a.data.id, thread.id, 'ar'), {
      code: 'analysisInvalid',
    });
    assert.equal(
      (await getAnalysisState(a.data.id, thread.id)).analysis?.sourceHash,
      analysis.sourceHash,
    );
    invalid = false;
    let release!: () => void;
    hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const running = analyzeConversation(a.data.id, thread.id, 'ar');
    await started;
    await assert.rejects(analyzeConversation(a.data.id, thread.id, 'ckb'), {
      code: 'analysisBusy',
    });
    await pool.query('UPDATE messages SET body=$1 WHERE id=$2', [
      'Correction: three travelers, not two.',
      evidenceId,
    ]);
    release();
    await assert.rejects(running, { code: 'analysisChanged' });
    assert.equal((await getAnalysisState(a.data.id, thread.id)).stale, true);
    const unchanged = await req(
      `/api/agencies/${a.data.id}/conversations`,
      'GET',
      undefined,
      owner,
    );
    assert.equal(unchanged.data.conversations[0].note, fields.note);
    assert.equal(unchanged.data.conversations[0].inquiryStatus, fields.inquiryStatus);
    delete process.env.ANTHROPIC_API_KEY;
    await assert.rejects(analyzeConversation(a.data.id, thread.id, 'ckb'), {
      code: 'analysisNotConfigured',
    });
    assert.equal(aiCalls, 3);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.ANTHROPIC_MODEL;
    else process.env.ANTHROPIC_MODEL = originalModel;
  }
  const foreign = await fetch(base + '/api/agencies', {
    method: 'POST',
    headers: {
      Origin: 'https://untrusted.example',
      'Content-Type': 'application/json',
      Cookie: owner,
    },
    body: JSON.stringify({ name: 'Blocked', slug: 'blocked', locale: 'en' }),
  });
  assert.equal(foreign.status, 403);
  console.log(
    'PASS: auth, locales, agency isolation, inbox edits, delivery tracking, AI persistence/cache, evidence validation, concurrent analysis, stale results, and unchanged staff fields. Meta and Anthropic were mocked; no external messages or AI requests were sent.',
  );
} finally {
  await pool.end();
}
