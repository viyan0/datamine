import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { connections } from '@/db/schema';

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

// A missing or ambiguous central sender must never fall back to a business inbox.
export async function centralConnection(
  executor: ReturnType<typeof getDb> | Transaction = getDb(),
  lock = false,
) {
  const query = executor
    .select()
    .from(connections)
    .where(eq(connections.campaignSender, true))
    .limit(2);
  // Use lock=true with a transaction when submitting a message, so switching
  // the central number cannot commit between sender selection and submission.
  const rows = lock ? await query.for('share') : await query;
  if (rows.length !== 1) return null;
  const connection = rows[0];
  return connection.verifiedAt && ['configured', 'receiving'].includes(connection.status)
    ? connection
    : null;
}
