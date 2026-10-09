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
      insert into customer_consents(phone,status,locale,notice_version,last_inbound_at,reply_connection_id,reply_message_id,reply_status) values ('test','accepted','en','test',now(),'c','reply','read');
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
    await db.exec(`
      insert into shared_profiles(id,phone,name,language,consent_version,consent_at)
      values ('profile','test','Test','en','test',now());
      insert into campaign_recipients(id,campaign_id,profile_id,profile_updated_at,reason,status)
      values ('recipient','offer','profile',now(),'Relevant','uncertain');
      update messages set type='text', request_id='recipient', delivery_status='submitting';
    `);
    assert.ok(
      automationDelay(await due(false))! >= 89,
      'recover a reply even if the processor stopped before linking its message',
    );
    await db.exec("update messages set delivery_status='uncertain'");
    assert.equal(await due(), null);
    await db.exec(`
      insert into messages(id,agency_id,connection_id,direction,contact_phone,type,provider_timestamp)
      values ('trigger','a','c','inbound','test','text',now());
      insert into recommendation_jobs(id,profile_id,conversation_id,trigger_message_id,mode,status,source_revision,profile_updated_at)
      values ('recommendation','profile','t','trigger','interest','pending',1,now());
    `);
    assert.equal(automationDelay(await due()), 2, 'pending recommendation wakes AI');
    assert.equal(await due(false), null, 'pending recommendation waits when AI is missing');
    await db.exec(
      "update recommendation_jobs set status='error', due_at=now() + interval '5 minutes'",
    );
    assert.ok(automationDelay(await due())! > 290, 'recommendation error respects backoff');
    await db.exec('update recommendation_jobs set due_at=null');
    assert.equal(await due(), null, 'exhausted recommendation retries do not spin');
    await db.exec(
      "update recommendation_jobs set status='processing', due_at=now(), started_at=now(), run_id='r'",
    );
    assert.ok(automationDelay(await due())! >= 89, 'active recommendation rank keeps its lease');
    await db.exec("update recommendation_jobs set started_at=now() - interval '2 minutes'");
    assert.equal(automationDelay(await due()), 2, 'expired rank is recoverable');
    await db.exec("update recommendation_jobs set status='queued', mode='stop', run_id=null");
    assert.equal(
      automationDelay(await due(false)),
      2,
      'topic-stop acknowledgement works without AI',
    );
    await db.exec(
      "update recommendation_jobs set status='submitting', started_at=now(), due_at=null",
    );
    assert.ok(
      automationDelay(await due(false))! >= 89,
      'in-flight recommendation send waits for recovery',
    );
    await db.exec("update recommendation_jobs set started_at=now() - interval '2 minutes'");
    assert.equal(
      automationDelay(await due(false)),
      2,
      'uncertain recommendation needs recovery without AI',
    );
    await db.exec("update recommendation_jobs set status='uncertain'");
    assert.equal(await due(), null, 'ambiguous recommendation is never replayed');
    await db.exec(
      "update messages set request_id='recommendation', delivery_status='submitting', created_at=now() where id='m'",
    );
    assert.ok(
      automationDelay(await due(false))! >= 89,
      'orphaned recommendation message is also recovered',
    );
    await db.exec("update messages set delivery_status='uncertain' where id='m'");
    assert.equal(await due(), null);
    assert.equal(automationDelay(null), null);
  } finally {
    await db.close();
  }
});
