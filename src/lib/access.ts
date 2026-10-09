import { headers } from 'next/headers';
import { and, eq } from 'drizzle-orm';
import { getAuth } from './auth';
import { getDb } from '@/db';
import { agencies, memberships } from '@/db/schema';
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
  const membership = await agencyAccessForUser(s.user, agencyId, manage);
  return { session: s, membership };
}

// Called only with the authenticated user, never a role supplied by the client.
export async function agencyAccessForUser(
  current: { id: string; platformRole?: string },
  agencyId: string,
  manage = false,
) {
  if (current.platformRole === 'admin') {
    const [agency] = await getDb()
      .select({ id: agencies.id })
      .from(agencies)
      .where(eq(agencies.id, agencyId));
    if (!agency) throw new HttpError(404, 'notFound');
    return { agencyId: agency.id, role: 'admin' };
  }
  const [membership] = await getDb()
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, current.id), eq(memberships.agencyId, agencyId)));
  if (!membership || (manage && !canManage(membership.role))) throw new HttpError(403, 'forbidden');
  return membership;
}
