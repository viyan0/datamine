import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { agencies, memberships, connections, user, messages, auditEvents } from '@/db/schema';

export type WorkspaceData = {
  user: { name: string; email: string; platformAdmin: boolean };
  agencies: {
    id: string;
    name: string;
    slug: string;
    locale: string;
    role: string;
    createdAt: string;
  }[];
  connections: {
    id: string;
    agencyId: string;
    agencyName: string;
    label: string;
    displayPhone: string;
    phoneNumberId: string;
    status: string;
    lastWebhookAt: string | null;
  }[];
  members: {
    id: string;
    agencyId: string;
    agencyName: string;
    name: string;
    email: string;
    role: string;
  }[];
  activity: { id: string; action: string; agencyName: string; createdAt: string }[];
  messageCount: number;
};
export async function loadWorkspace(current: {
  id: string;
  name: string;
  email: string;
  platformRole?: string;
}): Promise<WorkspaceData> {
  const db = getDb();
  const agencyRows = await db
    .select({
      id: agencies.id,
      name: agencies.name,
      slug: agencies.slug,
      locale: agencies.locale,
      role: memberships.role,
      createdAt: agencies.createdAt,
    })
    .from(memberships)
    .innerJoin(agencies, eq(agencies.id, memberships.agencyId))
    .where(eq(memberships.userId, current.id));
  const ids = agencyRows.map((a) => a.id);
  const own = {
    name: current.name,
    email: current.email,
    platformAdmin: current.platformRole === 'admin',
  };
  if (!ids.length)
    return { user: own, agencies: [], connections: [], members: [], activity: [], messageCount: 0 };
  const [connectionRows, memberRows, activityRows, countRows] = await Promise.all([
    db
      .select({
        id: connections.id,
        agencyId: connections.agencyId,
        agencyName: agencies.name,
        label: connections.label,
        displayPhone: connections.displayPhone,
        phoneNumberId: connections.phoneNumberId,
        status: connections.status,
        lastWebhookAt: connections.lastWebhookAt,
      })
      .from(connections)
      .innerJoin(agencies, eq(agencies.id, connections.agencyId))
      .where(inArray(connections.agencyId, ids)),
    db
      .select({
        id: memberships.id,
        agencyId: agencies.id,
        agencyName: agencies.name,
        name: user.name,
        email: user.email,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(agencies, eq(agencies.id, memberships.agencyId))
      .innerJoin(user, eq(user.id, memberships.userId))
      .where(inArray(memberships.agencyId, ids)),
    db
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        agencyName: agencies.name,
        createdAt: auditEvents.createdAt,
      })
      .from(auditEvents)
      .innerJoin(agencies, eq(agencies.id, auditEvents.agencyId))
      .where(inArray(agencies.id, ids))
      .orderBy(desc(auditEvents.createdAt))
      .limit(8),
    db
      .select({ count: sql<number>`count(*)::integer` })
      .from(messages)
      .where(and(inArray(messages.agencyId, ids), eq(messages.direction, 'inbound'))),
  ]);
  return {
    user: own,
    agencies: agencyRows.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
    connections: connectionRows.map((c) => ({
      ...c,
      lastWebhookAt: c.lastWebhookAt?.toISOString() ?? null,
    })),
    members: memberRows,
    activity: activityRows.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
    messageCount: countRows[0]?.count ?? 0,
  };
}
export async function listAgencyMessages(agencyId: string) {
  return getDb()
    .select({
      id: messages.id,
      type: messages.type,
      body: messages.body,
      direction: messages.direction,
      contactPhone: messages.contactPhone,
      receivedAt: messages.providerTimestamp,
    })
    .from(messages)
    .where(and(eq(messages.agencyId, agencyId)))
    .orderBy(desc(messages.providerTimestamp))
    .limit(30);
}
