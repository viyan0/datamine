import { and, desc, eq, ne, gte, lte, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  agencies,
  memberships,
  connections,
  conversations,
  user,
  messages,
  auditEvents,
  products,
  sharedProfiles,
  recommendationJobs,
} from '@/db/schema';
import { activityDays, type DashboardAnalytics } from './dashboard-analytics';
import { centralConnection } from './central-whatsapp';
import { businessChatOfferMode } from './platform-settings';
import type { BusinessChatOfferMode } from './offer-follow-up-types';

export type WorkspaceData = {
  user: { name: string; email: string; platformAdmin: boolean };
  centralWhatsapp?: { id: string; label: string; displayPhone: string } | null;
  businessChatOffers?: BusinessChatOfferMode;
  agencies: {
    id: string;
    name: string;
    slug: string;
    locale: string;
    industry: string;
    categories: string[];
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
  analytics?: DashboardAnalytics;
  platformOverview?: {
    activeOffers: number;
    enrolledCustomers: number;
    sentOffers: number;
    offersByBusiness: { id: string; name: string; count: number }[];
  };
};
export async function loadWorkspace(
  current: {
    id: string;
    name: string;
    email: string;
    platformRole?: string;
  },
  includeAnalytics = false,
): Promise<WorkspaceData> {
  const db = getDb();
  const central = await centralConnection();
  const centralWhatsapp = central
    ? { id: central.id, label: central.label, displayPhone: central.displayPhone }
    : null;
  const businessChatOffers =
    current.platformRole === 'admin' ? await businessChatOfferMode() : undefined;
  const agencyRows = await db
    .select({
      id: agencies.id,
      name: agencies.name,
      slug: agencies.slug,
      locale: agencies.locale,
      industry: agencies.industry,
      categories: agencies.categories,
      role:
        current.platformRole === 'admin' ? sql<string>`'admin'` : sql<string>`${memberships.role}`,
      createdAt: agencies.createdAt,
    })
    .from(agencies)
    .leftJoin(
      memberships,
      and(eq(agencies.id, memberships.agencyId), eq(memberships.userId, current.id)),
    )
    .where(
      and(
        eq(agencies.isPlatform, false),
        current.platformRole === 'admin' ? undefined : eq(memberships.userId, current.id),
      ),
    );
  const ids = agencyRows.map((a) => a.id);
  const own = {
    name: current.name,
    email: current.email,
    platformAdmin: current.platformRole === 'admin',
  };
  if (!ids.length && !own.platformAdmin)
    return {
      user: own,
      centralWhatsapp,
      businessChatOffers,
      agencies: [],
      connections: [],
      members: [],
      activity: [],
      messageCount: 0,
      ...(includeAnalytics
        ? {
            analytics: {
              daily: activityDays([]),
              conversations: { new: 0, inProgress: 0, closed: 0 },
            },
          }
        : {}),
    };
  const [connectionRows, memberRows, activityRows, countRows, analytics] = await Promise.all([
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
      .where(own.platformAdmin ? undefined : inArray(connections.agencyId, ids)),
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
      .where(and(inArray(memberships.agencyId, ids), ne(user.platformRole, 'admin'))),
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
    own.platformAdmin
      ? Promise.resolve([{ count: 0 }])
      : db
          .select({ count: sql<number>`count(*)::integer` })
          .from(messages)
          .where(and(inArray(messages.agencyId, ids), eq(messages.direction, 'inbound'))),
    includeAnalytics && !own.platformAdmin ? loadDashboardAnalytics(ids) : undefined,
  ]);
  const platformOverview =
    includeAnalytics && own.platformAdmin ? await loadPlatformOverview() : undefined;
  return {
    user: own,
    centralWhatsapp,
    businessChatOffers,
    agencies: agencyRows.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
    connections: connectionRows.map((c) => ({
      ...c,
      lastWebhookAt: c.lastWebhookAt?.toISOString() ?? null,
    })),
    members: memberRows,
    activity: activityRows.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
    messageCount: countRows[0]?.count ?? 0,
    ...(analytics ? { analytics } : {}),
    ...(platformOverview ? { platformOverview } : {}),
  };
}

async function loadPlatformOverview(): Promise<NonNullable<WorkspaceData['platformOverview']>> {
  const db = getDb();
  const [offersByBusiness, customers, sent] = await Promise.all([
    db
      .select({
        id: agencies.id,
        name: agencies.name,
        count: sql<number>`count(${products.id})::integer`,
      })
      .from(agencies)
      .leftJoin(
        products,
        and(
          eq(products.agencyId, agencies.id),
          eq(products.active, true),
          gte(products.expiresAt, new Date()),
        ),
      )
      .where(eq(agencies.isPlatform, false))
      .groupBy(agencies.id, agencies.name)
      .orderBy(agencies.name),
    db
      .select({ count: sql<number>`count(*)::integer` })
      .from(sharedProfiles)
      .where(eq(sharedProfiles.status, 'active')),
    db
      .select({ count: sql<number>`count(*)::integer` })
      .from(recommendationJobs)
      .where(
        and(
          inArray(recommendationJobs.status, ['accepted', 'sent', 'delivered', 'read']),
          sql`${recommendationJobs.campaignId} is not null`,
        ),
      ),
  ]);
  return {
    activeOffers: offersByBusiness.reduce((sum, item) => sum + item.count, 0),
    enrolledCustomers: customers[0].count,
    sentOffers: sent[0].count,
    offersByBusiness,
  };
}

async function loadDashboardAnalytics(agencyIds: string[]): Promise<DashboardAnalytics> {
  const db = getDb(),
    now = new Date();
  const days = activityDays([], now);
  const start = new Date(`${days[0].date}T00:00:00+03:00`);
  const day = sql<string>`to_char(${messages.providerTimestamp} at time zone 'Asia/Baghdad', 'YYYY-MM-DD')`;
  const [daily, counts] = await Promise.all([
    db
      .select({
        date: day,
        received: sql<number>`count(*) filter (where ${messages.direction} = 'inbound')::integer`,
        sent: sql<number>`count(*) filter (where ${messages.direction} = 'outbound' and ${messages.deliveryStatus} in ('sent', 'delivered', 'read'))::integer`,
      })
      .from(messages)
      .where(
        and(
          inArray(messages.agencyId, agencyIds),
          gte(messages.providerTimestamp, start),
          lte(messages.providerTimestamp, now),
        ),
      )
      .groupBy(day),
    db
      .select({
        new: sql<number>`count(*) filter (where ${conversations.inquiryStatus} = 'new')::integer`,
        inProgress: sql<number>`count(*) filter (where ${conversations.inquiryStatus} = 'inProgress')::integer`,
        closed: sql<number>`count(*) filter (where ${conversations.inquiryStatus} = 'closed')::integer`,
      })
      .from(conversations)
      .where(inArray(conversations.agencyId, agencyIds)),
  ]);
  return { daily: activityDays(daily, now), conversations: counts[0] };
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
