import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { getPool } from '../src/db';
import { loadWorkspace } from '../src/lib/workspace';
import { activityDays, dashboardDate } from '../src/lib/dashboard-analytics';

test('dashboard days use Baghdad midnight and include quiet days across month boundaries', () => {
  const before = new Date('2026-09-30T20:59:59Z');
  const after = new Date('2026-09-30T21:00:00Z');
  assert.equal(dashboardDate(before), '2026-09-30');
  assert.equal(dashboardDate(after), '2026-10-01');
  const days = activityDays([{ date: '2026-09-30', received: 2, sent: 1 }], after);
  assert.equal(days.length, 30);
  assert.equal(days[0].date, '2026-09-02');
  assert.deepEqual(days.at(-1), { date: '2026-10-01', received: 0, sent: 0 });
  assert.deepEqual(days.at(-2), { date: '2026-09-30', received: 2, sent: 1 });
});

test('dashboard aggregates only member businesses and excludes failed, old and future messages', async () => {
  const local = await PGlite.create();
  for (const file of (await readdir('./drizzle')).filter((f) => f.endsWith('.sql')).sort())
    await local.exec(await readFile(`./drizzle/${file}`, 'utf8'));
  const server = new PGLiteSocketServer({
    db: local,
    host: '127.0.0.1',
    port: 54335,
    maxConnections: 10,
  });
  await server.start();
  process.env.DATABASE_URL = 'postgres://postgres:postgres@127.0.0.1:54335/postgres';
  const db = getPool();
  try {
    await db.query(
      "insert into users(id,name,email) values ('viewer','Viewer','viewer@example.com'),('empty','Empty','empty@example.com')",
    );
    await db.query(
      "insert into agencies(id,name,slug) values ('own','Own','own'),('private','Private','private')",
    );
    await db.query(
      "insert into memberships(id,agency_id,user_id,role) values ('member','own','viewer','viewer')",
    );
    for (const id of ['own', 'private']) {
      await db.query(
        "insert into whatsapp_connections(id,agency_id,label,phone_number_id,waba_id,display_phone,access_token_encrypted,app_secret_encrypted) values ($1,$1,$1,$1,'waba','test','encrypted','encrypted')",
        [id],
      );
      await db.query(
        "insert into conversations(id,agency_id,connection_id,contact_phone,name,inquiry_status,last_inbound_at,last_message_at) values ($1,$1,$1,'test','Test','new',now(),now())",
        [id],
      );
    }
    const now = new Date();
    const yesterday = new Date(now.getTime() - 86400000);
    const add = (id: string, agency: string, direction: string, status: string, time = yesterday) =>
      db.query(
        "insert into messages(id,agency_id,connection_id,direction,delivery_status,contact_phone,type,provider_timestamp) values ($1,$2,$2,$3,$4,'test','text',$5)",
        [id, agency, direction, status, time],
      );
    await add('received', 'own', 'inbound', 'received');
    await add('sent', 'own', 'outbound', 'delivered');
    await add('failed', 'own', 'outbound', 'failed');
    await add('uncertain', 'own', 'outbound', 'uncertain');
    await add('queued', 'own', 'outbound', 'queued');
    await add('private', 'private', 'inbound', 'received');
    await add('old', 'own', 'inbound', 'received', new Date(now.getTime() - 31 * 86400000));
    await add('future', 'own', 'inbound', 'received', new Date(now.getTime() + 86400000));
    const viewer = {
      id: 'viewer',
      name: 'Viewer',
      email: 'viewer@example.com',
      platformRole: 'staff',
    };
    const workspace = await loadWorkspace(viewer, true);
    assert.equal(workspace.agencies.length, 1);
    assert.equal(workspace.analytics?.daily.length, 30);
    assert.equal(
      workspace.analytics?.daily.reduce((sum, day) => sum + day.received, 0),
      1,
    );
    assert.equal(
      workspace.analytics?.daily.reduce((sum, day) => sum + day.sent, 0),
      1,
    );
    assert.deepEqual(
      workspace.analytics?.daily.find((day) => day.date === dashboardDate(yesterday)),
      { date: dashboardDate(yesterday), received: 1, sent: 1 },
    );
    assert.deepEqual(workspace.analytics?.conversations, { new: 1, inProgress: 0, closed: 0 });
    assert.equal((await loadWorkspace(viewer)).analytics, undefined);
    const empty = await loadWorkspace(
      { id: 'empty', name: 'Empty', email: 'empty@example.com' },
      true,
    );
    assert.equal(empty.analytics?.daily.length, 30);
    assert.equal(
      empty.analytics?.daily.reduce((sum, day) => sum + day.received + day.sent, 0),
      0,
    );
    assert.deepEqual(empty.analytics?.conversations, { new: 0, inProgress: 0, closed: 0 });
  } finally {
    await db.end();
    await server.stop();
    await local.close();
  }
});
