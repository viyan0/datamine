import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { getPool } from '../src/db/index';
const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
const pool = getPool(),
  client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(1970311)');
  const existing = await client.query('SELECT id FROM users LIMIT 1');
  if (!existing.rowCount) {
    if (!email || !password || password.length < 12)
      throw new Error('Set a valid bootstrap email and a password of at least 12 characters.');
    const id = randomUUID(),
      agencyId = randomUUID();
    await client.query(
      'INSERT INTO users (id,name,email,email_verified,platform_role) VALUES ($1,$2,$3,false,$4)',
      [id, process.env.BOOTSTRAP_ADMIN_NAME || 'Workspace owner', email, 'admin'],
    );
    await client.query(
      'INSERT INTO accounts (id,account_id,provider_id,user_id,password) VALUES ($1,$2,$3,$2,$4)',
      [randomUUID(), id, 'credential', await hashPassword(password)],
    );
    await client.query('INSERT INTO agencies (id,name,slug) VALUES ($1,$2,$3)', [
      agencyId,
      'Datamine',
      'datamine',
    ]);
    await client.query('INSERT INTO memberships (id,agency_id,user_id,role) VALUES ($1,$2,$3,$4)', [
      randomUUID(),
      agencyId,
      id,
      'owner',
    ]);
    console.log('Initial workspace owner created.');
  } else {
    console.log('Bootstrap skipped: workspace already initialized.');
  }
  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
  await pool.end();
}
