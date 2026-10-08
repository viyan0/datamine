import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { automationDelay, automationDueSql } from '../src/lib/automation-schedule';

test('queue wakeups respect retries and leases, recover sends, and stop when idle', async () => {
  const db = await PGlite.create();
  const due = async (ai = true) =>
    (await db.query<{ due_at: Date | null }>(automationDueSql, [ai])).rows[0].due_at;
  try {
    for (const file of (await readdir('./drizzle')).filter((f) => f.endsWith('.sql')).sort())
      await db.exec(await readFile(`./drizzle/${file}`, 'utf8'));
    assert.equal(await due(), null);
    await db.exec(`
      insert into users(id,name,email) values ('u','Owner','owner@example.com');
      insert into agencies(id,name,slug) values ('a','Business','business');
      insert into whatsapp_connections(id,agency_id,label,phone_number_id,waba_id,display_phone,access_token_encrypted,app_secret_encrypted)
      values ('c','a','Test','1','2','test','encrypted','encrypted');
      insert into conversations(id,agency_id,connection_id,contact_phone,name,last_inbound_at,last_message_at)
      values ('t','a','c','test','Test',now(),now());
    `);
    assert.equal(automationDelay(await due()), 2);
    assert.equal(await due(false), null, 'missing AI credentials must not spin the queue');
    await db.exec("update conversations set analysis_due_at = now() + interval '5 minutes'");
    assert.ok(automationDelay(await due())! > 290, 'respect provider backoff');
    await db.exec(
      "update conversations set analysis_due_at = now(), analysis_run_id = 'run', analysis_started_at = now()",
    );
    assert.ok(automationDelay(await due())! >= 89, 'wait for an active claim');
    await db.exec("update conversations set analysis_started_at = now() - interval '2 minutes'");
    assert.equal(automationDelay(await due()), 2, 'recover a crashed processor');
    await db.exec('update conversations set analysis_due_at = null');
    await db.exec(`
      insert into campaigns(id,agency_id,created_by,title,offer_text,locale,status,due_at)
      values ('offer','a','u','Offer','An approved offer','en','sending',null);
    `);
    assert.equal(automationDelay(await due(false)), 2, 'finish sends even without AI');
    await db.exec("update campaigns set status = 'complete'");
    await db.exec(`
      insert into messages(id,agency_id,connection_id,direction,contact_phone,type,delivery_status,provider_timestamp)
      values ('m','a','c','outbound','test','template','submitting',now());
    `);
    assert.ok(automationDelay(await due(false))! >= 89, 'recover orphaned sends after the lease');
    await db.exec("update messages set delivery_status = 'uncertain'");
    assert.equal(await due(), null, 'uncertain delivery is never automatically replayed');
    assert.equal(automationDelay(null), null);
  } finally {
    await db.close();
  }
});
