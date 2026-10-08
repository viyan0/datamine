import { headers } from 'next/headers';
import { and, eq } from 'drizzle-orm';
import { getAuth } from './auth';
import { getDb } from '@/db';
import { memberships } from '@/db/schema';
import { canManage } from './security';
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
export async function requireSession() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) throw new HttpError(401, 'unauthorized');
  return session;
}
export async function requirePlatformAdmin() {
  const s = await requireSession();
  if (s.user.platformRole !== 'admin') throw new HttpError(403, 'forbidden');
  return s;
}
export async function requireAgency(agencyId: string, manage = false) {
  const s = await requireSession();
  const [membership] = await getDb()
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, s.user.id), eq(memberships.agencyId, agencyId)));
  // Platform administrators still require membership to access private agency data.
  if (!membership || (manage && !canManage(membership.role))) throw new HttpError(403, 'forbidden');
  return { session: s, membership };
}
