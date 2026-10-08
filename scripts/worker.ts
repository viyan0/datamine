import { PgBoss } from 'pg-boss';
import { eq } from 'drizzle-orm';
import { getDb, getPool } from '../src/db/index';
import { connections } from '../src/db/schema';
import { decrypt } from '../src/lib/security';
import { verifyMetaNumber } from '../src/lib/meta';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const boss = new PgBoss({ connectionString: process.env.DATABASE_URL, max: 3 });
boss.on('error', () => console.error('Background queue error; inspect database connectivity.'));
await boss.start();
await boss.createQueue('connection-health-sweep');
await boss.createQueue('connection-health', {
  retryLimit: 3,
  retryDelay: 60,
  retryBackoff: true,
  expireInSeconds: 120,
});
await boss.work('connection-health-sweep', async () => {
  const list = await getDb().select({ id: connections.id }).from(connections);
  for (const connection of list)
    await boss.send('connection-health', { id: connection.id }, { singletonKey: connection.id });
});
await boss.work<{ id: string }>('connection-health', async (jobs) => {
  for (const job of jobs) {
    const [connection] = await getDb()
      .select()
      .from(connections)
      .where(eq(connections.id, job.data.id));
    if (!connection) continue;
    await verifyMetaNumber({
      phoneNumberId: connection.phoneNumberId,
      wabaId: connection.wabaId,
      accessToken: decrypt(connection.accessTokenEncrypted, `${connection.id}:token`),
    });
    await getDb()
      .update(connections)
      .set({ verifiedAt: new Date() })
      .where(eq(connections.id, connection.id));
  }
});
await boss.schedule('connection-health-sweep', '*/15 * * * *');
console.log('Connection health worker ready. AI analysis is introduced in Phase 3.');
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    await boss.stop({ graceful: true, timeout: 25000 });
    await getPool().end();
    process.exit(0);
  });
