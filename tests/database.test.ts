import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
test('migrations enforce unique membership, unique provider messages and referential integrity', async () => {
  const db = await PGlite.create();
  try {
    for (const file of (await readdir('./drizzle')).filter((f) => f.endsWith('.sql')).sort())
      await db.exec(await readFile(`./drizzle/${file}`, 'utf8'));
    await db.query("INSERT INTO users(id,name,email) VALUES ('u1','Staff','staff@example.com')");
    await db.query(
      "INSERT INTO agencies(id,name,slug) VALUES ('a1','Agency One','agency-one'),('a2','Agency Two','agency-two')",
    );
    await db.query(
      "INSERT INTO memberships(id,agency_id,user_id,role) VALUES ('m1','a1','u1','agent')",
    );
    await assert.rejects(
      db.query(
        "INSERT INTO memberships(id,agency_id,user_id,role) VALUES ('m2','a1','u1','admin')",
      ),
    );
    await assert.rejects(
      db.query(
        "INSERT INTO memberships(id,agency_id,user_id,role) VALUES ('m3','missing','u1','agent')",
      ),
    );
    await db.query(
      "INSERT INTO whatsapp_connections(id,agency_id,label,phone_number_id,waba_id,display_phone,access_token_encrypted,app_secret_encrypted) VALUES ('c1','a1','Test','11111','22222','test','encrypted','encrypted')",
    );
    await db.query(
      "INSERT INTO messages(id,agency_id,connection_id,provider_message_id,direction,contact_phone,type,provider_timestamp) VALUES ('msg1','a1','c1','wamid.1','inbound','test','text',now())",
    );
    await assert.rejects(
      db.query(
        "INSERT INTO messages(id,agency_id,connection_id,provider_message_id,direction,contact_phone,type,provider_timestamp) VALUES ('msg2','a1','c1','wamid.1','inbound','test','text',now())",
      ),
    );
    const result = await db.query(
      "SELECT messages.id FROM messages JOIN memberships ON messages.agency_id=memberships.agency_id WHERE memberships.user_id='u1' AND messages.agency_id='a2'",
    );
    assert.equal(result.rows.length, 0);
  } finally {
    await db.close();
  }
});
