import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { getPool } from '../src/db/index';
import { encrypt } from '../src/lib/security';
import { replyToConversation } from '../src/lib/inbox';
import { analyzeConversation, getAnalysisState } from '../src/lib/analysis';
import { sendEnrollmentCode } from '../src/lib/enrollment';
import { digest } from '../src/lib/security';
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
    {
      name: `Test Agency A ${suffix}`,
      slug: `test-a-${suffix}`,
      locale: 'en',
      industry: 'Travel',
      categories: ['flight', 'visa', 'hotel', 'other'],
    },
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
            inquiryStatus: 'new',
            subject: null,
            stopOffers: null,
            summary: 'Two travelers need a flight and visa to Istanbul.',
            nextStep: 'Confirm travel dates.',
            reviewNote: 'The exact date and year need confirmation.',
            facts: [
              {
                label: 'location',
                value: 'Istanbul',
                quote: invalid ? 'invented quote' : 'Istanbul',
                messageId: evidenceId,
              },
              { label: 'date', value: 'next Friday', quote: 'next Friday', messageId: evidenceId },
              { label: 'quantity', value: 'Two', quote: 'Two travelers', messageId: evidenceId },
            ],
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
    assert.equal(
      persisted.data.analysis.result.facts.find((f: { label: string }) => f.label === 'location')
        .value,
      'Istanbul',
    );
    assert.equal(persisted.data.stale, false);
    assert.equal(
      (
        await req(
          '/api/agencies/' + a.data.id,
          'PATCH',
          { industry: 'Travel', categories: ['flight', 'visa', 'hotel', 'other', 'support'] },
          owner,
        )
      ).status,
      200,
    );
    assert.equal(
      (await getAnalysisState(a.data.id, thread.id)).stale,
      true,
      'Business configuration changes invalidate analysis',
    );
    assert.equal(
      (
        await req(
          '/api/agencies/' + a.data.id,
          'PATCH',
          { industry: 'Travel', categories: ['flight', 'visa', 'hotel', 'other'] },
          owner,
        )
      ).status,
      200,
    );
    assert.equal((await getAnalysisState(a.data.id, thread.id)).stale, false);
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
  // Phase 4: public verification, explicit consent, private business data, and withdrawal.
  assert.equal((await req('/api/customers')).status, 401);
  assert.equal((await req('/api/customers', 'GET', undefined, viewer)).status, 403);
  assert.equal((await req('/en/app/customers', 'GET', undefined, viewer)).status, 404);
  assert.equal(
    (await req(`${threadPath}/enrollment`, 'POST', { locale: 'en' }, viewer)).status,
    403,
  );
  assert.equal(
    (
      await req(
        `/api/agencies/${b.data.id}/conversations/${thread.id}/enrollment`,
        'POST',
        { locale: 'en' },
        owner,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await req(
        `/api/agencies/${a.data.id}`,
        'PATCH',
        { industry: 'Furniture', categories: ['furniture'] },
        viewer,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await req(
        `/api/agencies/${b.data.id}`,
        'PATCH',
        { industry: 'Furniture', categories: ['furniture', 'delivery', 'پشتیوانی'] },
        owner,
      )
    ).status,
    200,
  );
  assert.equal(
    (await req(`/api/agencies/${b.data.id}`, 'PATCH', { industry: '', categories: [] }, owner))
      .status,
    400,
  );
  const phone = `964${Date.now().toString().slice(-10)}`;
  await pool.query(
    "UPDATE conversations SET contact_phone=$1,last_inbound_at=now()-interval '1 minute' WHERE id=$2",
    [phone, thread.id],
  );
  const link = await req(`${threadPath}/enrollment`, 'POST', { locale: 'en' }, owner);
  assert.equal(link.status, 201);
  const enrollmentToken = new URL(link.data.url).hash.slice(1);
  assert.equal(new URL(link.data.url).search, '');
  assert.equal(
    (await req(`${threadPath}/enrollment`, 'POST', { locale: 'en' }, owner)).status,
    429,
  );
  const info = await req('/api/customer/access', 'POST', { token: enrollmentToken });
  assert.equal(info.status, 200);
  assert.equal(info.data.maskedPhone, `•••• ${phone.slice(-4)}`);
  assert.deepEqual(Object.keys(info.data).sort(), ['agency', 'maskedPhone']);
  assert.equal((await req('/api/customer/profile')).status, 401);
  const profile = {
    name: 'Local enrolled customer',
    language: 'ckb',
    interests: ['furniture', 'appointment'],
    destination: 'Home office',
    locale: 'en',
  };
  assert.equal(
    (await req('/api/customer/profile', 'POST', { ...profile, consent: true }, owner)).status,
    401,
    'Staff session cannot replace customer verification',
  );
  assert.equal(
    (await req('/api/customer/verify', 'POST', { token: enrollmentToken, code: '000000' })).status,
    400,
  );
  let verificationCode = '',
    codeSends = 0,
    codeDelivery = 'accepted';
  globalThis.fetch = async (input, init) => {
    if (!String(input).startsWith('https://graph.facebook.com/')) return originalFetch(input, init);
    codeSends++;
    const payload = JSON.parse(String(init?.body));
    assert.equal(payload.to, phone);
    verificationCode = payload.text.body.match(/\b\d{6}\b/)[0];
    if (codeDelivery === 'uncertain') throw new Error('Simulated network uncertainty');
    if (codeDelivery === 'failed') return Response.json({ error: { code: 100 } }, { status: 400 });
    return Response.json({ messages: [{ id: `wamid.code-${suffix}-${codeSends}` }] });
  };
  try {
    const sent = await sendEnrollmentCode(enrollmentToken, 'en');
    assert.deepEqual(sent, { uncertain: false });
    await assert.rejects(sendEnrollmentCode(enrollmentToken, 'en'), { code: 'codeWait' });
    assert.equal(codeSends, 1);
    const storedCode = (
      await pool.query('SELECT code_hash FROM enrollment_links WHERE token_hash=$1', [
        digest(enrollmentToken),
      ])
    ).rows[0].code_hash;
    assert.notEqual(storedCode, verificationCode);
    assert.ok(
      !(await pool.query('SELECT body FROM messages WHERE connection_id=$1', [idA])).rows.some(
        (r) => r.body?.includes(verificationCode),
      ),
      'OTP is excluded from staff message history',
    );
    assert.equal(
      (await req('/api/customer/verify', 'POST', { token: enrollmentToken, code: '000000' }))
        .status,
      400,
    );
    const verified = await req('/api/customer/verify', 'POST', {
      token: enrollmentToken,
      code: verificationCode,
    });
    assert.equal(verified.status, 200);
    assert.ok(verified.cookie.startsWith('datamine-customer='));
    assert.equal(
      (
        await req('/api/customer/verify', 'POST', {
          token: enrollmentToken,
          code: verificationCode,
        })
      ).status,
      400,
      'Codes are single-use',
    );
    const beforeConsent = await req('/api/customer/profile', 'GET', undefined, verified.cookie);
    assert.equal(beforeConsent.data.phone, phone);
    assert.equal(beforeConsent.data.profile, null, 'Verification does not enroll');
    assert.equal(
      (await req('/api/customer/profile', 'POST', profile, verified.cookie)).status,
      400,
      'Consent must be explicit',
    );
    const joined = await req(
      '/api/customer/profile',
      'POST',
      { ...profile, consent: true, phone: '111111111', note: 'Do not import' },
      verified.cookie,
    );
    assert.equal(joined.status, 200);
    assert.equal(joined.data.profile.phone, phone, 'Customer cannot choose another verified phone');
    assert.equal(joined.data.profile.note, undefined);
    assert.equal(joined.data.profile.status, 'active');
    const directory = await req('/api/customers', 'GET', undefined, owner);
    const entry = directory.data.profiles.find((p: { phone: string }) => p.phone === phone);
    assert.equal(entry.name, profile.name);
    assert.ok(!JSON.stringify(entry).includes(fields.note));
    assert.deepEqual(
      Object.keys(entry).sort(),
      [
        'id',
        'phone',
        'name',
        'language',
        'destination',
        'interests',
        'status',
        'consentAt',
        'updatedAt',
      ].sort(),
    );
    assert.equal(
      (await req('/api/customer/opt-out', 'POST', { locale: 'en' }, verified.cookie)).data.profile
        .status,
      'optedOut',
    );
    await req('/api/customer/opt-out', 'POST', { locale: 'en' }, verified.cookie);
    const edited = await req(
      '/api/customer/preferences',
      'POST',
      { ...profile, name: 'Updated by customer' },
      verified.cookie,
    );
    assert.equal(
      edited.data.profile.status,
      'optedOut',
      'Preference edits never silently re-enroll',
    );
    const rejoined = await req(
      '/api/customer/profile',
      'POST',
      { ...profile, consent: true },
      verified.cookie,
    );
    assert.equal(
      rejoined.data.profile.id,
      joined.data.profile.id,
      'Same phone has one shared profile',
    );
    assert.equal(rejoined.data.profile.status, 'active');
    const events = await pool.query(
      'SELECT action,notice_version FROM profile_events WHERE profile_id=$1',
      [entry.id],
    );
    assert.equal(events.rows.filter((e) => e.action === 'optedOut').length, 1);
    assert.ok(events.rows.every((e) => e.notice_version === '2026-10-08-v1'));
    await pool.query(
      "UPDATE enrollment_links SET session_expires_at=now()-interval '1 minute' WHERE token_hash=$1",
      [digest(enrollmentToken)],
    );
    assert.equal(
      (await req('/api/customer/profile', 'GET', undefined, verified.cookie)).status,
      401,
    );
    assert.equal(
      (await req('/api/customer/preferences', 'POST', profile, verified.cookie)).status,
      401,
    );

    // A new link in another business to the same phone can manage the same consented profile.
    const secondThread = (
      await pool.query('SELECT id FROM conversations WHERE connection_id=$1', [idB])
    ).rows[0].id;
    await pool.query(
      "UPDATE conversations SET contact_phone=$1,last_inbound_at=now()-interval '1 minute' WHERE id=$2",
      [phone, secondThread],
    );
    const secondPath = `/api/agencies/${b.data.id}/conversations/${secondThread}/enrollment`;
    const secondLink = await req(secondPath, 'POST', { locale: 'en' }, owner);
    const secondToken = new URL(secondLink.data.url).hash.slice(1);
    await pool.query(
      "UPDATE conversations SET last_inbound_at=now()-interval '25 hours' WHERE id=$1",
      [secondThread],
    );
    assert.equal(
      (await req('/api/customer/code', 'POST', { token: secondToken, locale: 'en' })).data.error,
      'codeWindowClosed',
    );
    await pool.query(
      "UPDATE conversations SET last_inbound_at=now()-interval '1 minute' WHERE id=$1",
      [secondThread],
    );
    codeDelivery = 'failed';
    await assert.rejects(sendEnrollmentCode(secondToken, 'en'), { code: 'codeSendFailed' });
    assert.equal(
      (await req('/api/customer/verify', 'POST', { token: secondToken, code: verificationCode }))
        .status,
      400,
      'Rejected code cannot verify',
    );
    await pool.query(
      "UPDATE enrollment_links SET code_sent_at=now()-interval '2 minutes' WHERE token_hash=$1",
      [digest(secondToken)],
    );
    codeDelivery = 'uncertain';
    assert.deepEqual(await sendEnrollmentCode(secondToken, 'en'), { uncertain: true });
    await assert.rejects(sendEnrollmentCode(secondToken, 'en'), { code: 'codeWait' });
    const sharedAccess = await req('/api/customer/verify', 'POST', {
      token: secondToken,
      code: verificationCode,
    });
    assert.equal(sharedAccess.status, 200);
    assert.equal(
      (await req('/api/customer/profile', 'GET', undefined, sharedAccess.cookie)).data.profile.id,
      entry.id,
    );

    // New link for lockout and expiry checks, using only the local fixture row.
    await pool.query(
      "UPDATE enrollment_links SET created_at=now()-interval '2 hours' WHERE conversation_id=$1",
      [secondThread],
    );
    const lockedLink = await req(secondPath, 'POST', { locale: 'en' }, owner);
    const lockedToken = new URL(lockedLink.data.url).hash.slice(1);
    codeDelivery = 'accepted';
    await sendEnrollmentCode(lockedToken, 'en');
    for (let i = 0; i < 5; i++)
      assert.equal(
        (await req('/api/customer/verify', 'POST', { token: lockedToken, code: '000000' })).status,
        400,
      );
    assert.equal(
      (await req('/api/customer/verify', 'POST', { token: lockedToken, code: verificationCode }))
        .data.error,
      'enrollmentLocked',
    );
    await assert.rejects(sendEnrollmentCode(lockedToken, 'en'), { code: 'enrollmentLocked' });
    await pool.query(
      "UPDATE enrollment_links SET attempts=0, code_expires_at=now()-interval '1 minute' WHERE token_hash=$1",
      [digest(lockedToken)],
    );
    assert.equal(
      (await req('/api/customer/verify', 'POST', { token: lockedToken, code: verificationCode }))
        .data.error,
      'codeInvalid',
    );
    await pool.query(
      "UPDATE enrollment_links SET expires_at=now()-interval '1 minute' WHERE token_hash=$1",
      [digest(lockedToken)],
    );
    assert.equal((await req('/api/customer/access', 'POST', { token: lockedToken })).status, 410);
    await assert.rejects(sendEnrollmentCode(lockedToken, 'en'), { code: 'enrollmentExpired' });
  } finally {
    globalThis.fetch = originalFetch;
  }
  for (const locale of ['en', 'ar', 'ckb']) {
    assert.equal((await req(`/${locale}/enroll/demo`)).status, 200);
    assert.equal((await req(`/${locale}/demo/customers`)).status, 200);
  }
  const crossOriginConsent = await fetch(base + '/api/customer/profile', {
    method: 'POST',
    headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...profile, consent: true }),
  });
  assert.equal(crossOriginConsent.status, 403);
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
    'PASS: auth, locales, business isolation/settings, inbox, delivery tracking, AI/cache/evidence, OTP expiry/replay/throttling, explicit consent, shared profile deduplication, opt-out, and private-data boundaries. Meta and Anthropic were mocked; no external messages or AI requests were sent.',
  );
} finally {
  await pool.end();
}
