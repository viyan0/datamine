import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { getPool } from '../src/db/index';
import { encrypt } from '../src/lib/security';
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
    'PASS: health, three locales, login, closed registration, invitations, single-use tokens, viewer permissions, agency isolation, encrypted credentials, signed multi-agency webhooks, duplicate replay, and cross-origin protection.',
  );
} finally {
  await pool.end();
}
