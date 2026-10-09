import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  connections,
  conversations,
  messages,
  customerConsents,
  sharedProfiles,
  campaignRecipients,
  recommendationJobs,
} from '@/db/schema';
import { HttpError } from './access';
import { decrypt } from './security';
import { sendMetaText } from './meta';
import { replyWindowOpen, type Conversation, type InboxMessage } from './inbox-types';
import { analysisVersion } from './analysis-types';
import { refreshOfferAudiences } from './consent';

export async function getConversation(agencyId: string, id: string) {
  const [row] = await getDb()
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.agencyId, agencyId)));
  if (!row) throw new HttpError(404, 'notFound');
  return row;
}

type CustomerDetails = Partial<
  Pick<
    typeof conversations.$inferSelect,
    'name' | 'service' | 'destination' | 'inquiryStatus' | 'note'
  >
>;
export async function updateConversationDetails(
  agencyId: string,
  id: string,
  fields: CustomerDetails | { automatic: true },
) {
  const original = await getConversation(agencyId, id);
  return getDb().transaction(async (tx) => {
    // Serialize preference edits with opt-out and delivery before changing the chat.
    await tx
      .select({ phone: customerConsents.phone })
      .from(customerConsents)
      .where(eq(customerConsents.phone, original.contactPhone))
      .for('update');
    const [profile] = await tx
      .select()
      .from(sharedProfiles)
      .where(eq(sharedProfiles.phone, original.contactPhone))
      .for('update');
    const [current] = await tx
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.agencyId, agencyId)))
      .for('update');
    if (!current) throw new HttpError(404, 'notFound');
    const automatic = 'automatic' in fields;
    const changed = automatic
      ? []
      : (['service', 'destination', 'inquiryStatus'] as const).filter(
          (field) => fields[field] !== undefined && current[field] !== fields[field],
        );
    await tx
      .update(conversations)
      .set(
        automatic
          ? {
              manualFields: [],
              analysis: null,
              analysisStatus: 'pending',
              analysisDueAt: new Date(),
              analysisAttempts: 0,
              analysisRevision: sql`${conversations.analysisRevision} + 1`,
            }
          : { ...fields, manualFields: [...new Set([...current.manualFields, ...changed])] },
      )
      .where(eq(conversations.id, id));
    if (!automatic && !changed.length) return false;
    if (profile) {
      await tx
        .update(sharedProfiles)
        .set({
          updatedAt: sql`greatest(now(), ${sharedProfiles.updatedAt} + interval '1 millisecond')`,
          ...(automatic ? { offerHold: true } : {}),
        })
        .where(eq(sharedProfiles.id, profile.id));
      await tx
        .update(campaignRecipients)
        .set({ status: 'cancelled' })
        .where(
          and(
            eq(campaignRecipients.profileId, profile.id),
            inArray(campaignRecipients.status, ['matched', 'queued']),
          ),
        );
      await tx
        .update(recommendationJobs)
        .set({ status: 'cancelled', dueAt: null, runId: null })
        .where(
          and(
            eq(recommendationJobs.profileId, profile.id),
            inArray(recommendationJobs.status, ['pending', 'processing', 'queued', 'error']),
          ),
        );
      await refreshOfferAudiences(tx, [profile.language]);
    }
    return true;
  });
}

export async function listConversations(agencyId: string): Promise<Conversation[]> {
  const rows = await getDb()
    .select({
      conversation: conversations,
      consentStatus: customerConsents.status,
      consentReplyStatus: customerConsents.replyStatus,
      connectionLabel: connections.label,
      displayPhone: connections.displayPhone,
      preview: sql<
        string | null
      >`(select body from messages m where m.connection_id = ${conversations.connectionId} and m.contact_phone = ${conversations.contactPhone} order by m.provider_timestamp desc, m.id desc limit 1)`,
    })
    .from(conversations)
    .innerJoin(connections, eq(conversations.connectionId, connections.id))
    .leftJoin(customerConsents, eq(customerConsents.phone, conversations.contactPhone))
    .where(eq(conversations.agencyId, agencyId))
    .orderBy(desc(conversations.lastMessageAt));
  return rows.map(({ conversation: c, ...rest }) => ({
    id: c.id,
    agencyId: c.agencyId,
    connectionId: c.connectionId,
    contactPhone: c.contactPhone,
    name: c.name,
    destination: c.destination,
    note: c.note,
    manualFields: c.manualFields,
    categories: c.analysis?.version === analysisVersion ? c.analysis.result.services : [],
    ...rest,
    service: c.service as Conversation['service'],
    inquiryStatus: c.inquiryStatus as Conversation['inquiryStatus'],
    lastInboundAt: c.lastInboundAt.toISOString(),
    lastMessageAt: c.lastMessageAt.toISOString(),
  }));
}

function serializeMessage(m: typeof messages.$inferSelect): InboxMessage {
  return {
    id: m.id,
    body: m.body,
    imageUrl: m.imageUrl,
    type: m.type,
    direction: m.direction,
    deliveryStatus:
      m.deliveryStatus === 'submitting' && Date.now() - m.createdAt.getTime() > 60000
        ? 'uncertain'
        : m.deliveryStatus,
    timestamp: m.providerTimestamp.toISOString(),
  };
}
export async function conversationMessages(agencyId: string, id: string) {
  const c = await getConversation(agencyId, id);
  const rows = await getDb()
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.agencyId, agencyId),
        eq(messages.connectionId, c.connectionId),
        eq(messages.contactPhone, c.contactPhone),
      ),
    )
    .orderBy(desc(messages.providerTimestamp), desc(messages.id))
    .limit(100);
  return rows.reverse().map(serializeMessage);
}

export async function replyToConversation(
  agencyId: string,
  id: string,
  body: string,
  requestId: string,
) {
  const db = getDb();
  const c = await getConversation(agencyId, id);
  // Persist before contacting Meta. Retrying this request ID never submits a second message.
  const [existing] = await db.select().from(messages).where(eq(messages.requestId, requestId));
  if (existing) {
    if (
      existing.agencyId !== agencyId ||
      existing.connectionId !== c.connectionId ||
      existing.contactPhone !== c.contactPhone ||
      existing.body !== body
    )
      throw new HttpError(409, 'requestConflict');
    return serializeMessage(existing);
  }
  if (!replyWindowOpen(c.lastInboundAt)) throw new HttpError(409, 'replyWindowClosed');
  const [connection] = await db
    .select()
    .from(connections)
    .where(and(eq(connections.id, c.connectionId), eq(connections.agencyId, agencyId)));
  if (!connection) throw new HttpError(404, 'notFound');
  const accessToken = decrypt(connection.accessTokenEncrypted, `${connection.id}:token`);
  const [pending] = await db
    .insert(messages)
    .values({
      id: randomUUID(),
      agencyId,
      connectionId: c.connectionId,
      requestId,
      direction: 'outbound',
      contactPhone: c.contactPhone,
      type: 'text',
      body,
      deliveryStatus: 'submitting',
      providerTimestamp: new Date(),
    })
    .onConflictDoNothing()
    .returning();
  if (!pending) return replyToConversation(agencyId, id, body, requestId);
  await db
    .update(conversations)
    .set({
      lastMessageAt: sql`greatest(${conversations.lastMessageAt}, ${pending.providerTimestamp})`,
    })
    .where(eq(conversations.id, id));
  const result = await sendMetaText({
    phoneNumberId: connection.phoneNumberId,
    accessToken,
    to: c.contactPhone,
    body,
    messageId: pending.id,
  });
  await db
    .update(messages)
    .set({
      ...(result.providerMessageId ? { providerMessageId: result.providerMessageId } : {}),
      // A callback may already have arrived while the HTTP response was in flight.
      deliveryStatus: sql`case when ${messages.deliveryStatus} in ('submitting', 'uncertain') then ${result.status} else ${messages.deliveryStatus} end`,
    })
    .where(eq(messages.id, pending.id));
  const [saved] = await db.select().from(messages).where(eq(messages.id, pending.id));
  if (['accepted', 'sent', 'delivered', 'read'].includes(saved.deliveryStatus))
    await db
      .update(conversations)
      .set({
        analysisDueAt: new Date(Date.now() + 2000),
        analysisStatus: 'pending',
        analysisError: null,
        analysisAttempts: 0,
        analysisRevision: sql`${conversations.analysisRevision} + 1`,
      })
      .where(eq(conversations.id, id));
  return serializeMessage(saved);
}
