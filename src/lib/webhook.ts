import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { connections, providerEvents, messages, conversations } from '@/db/schema';
import { decrypt, verifySignature } from './security';
import { HttpError } from './access';

const eventSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(
    z.object({
      id: z.string(),
      changes: z.array(
        z.object({
          field: z.string(),
          value: z
            .object({
              metadata: z.object({ phone_number_id: z.string() }),
              contacts: z
                .array(
                  z.object({
                    wa_id: z.string(),
                    profile: z.object({ name: z.string() }).optional(),
                  }),
                )
                .optional(),
              messages: z
                .array(
                  z
                    .object({
                      id: z.string(),
                      from: z.string(),
                      timestamp: z.string().regex(/^\d+$/),
                      type: z.string(),
                      text: z.object({ body: z.string() }).optional(),
                    })
                    .passthrough(),
                )
                .optional(),
              statuses: z
                .array(
                  z
                    .object({
                      id: z.string(),
                      status: z.string(),
                      timestamp: z.string(),
                      biz_opaque_callback_data: z.string().optional(),
                    })
                    .passthrough(),
                )
                .optional(),
            })
            .passthrough(),
        }),
      ),
    }),
  ),
});
export function parseWebhook(raw: string) {
  return eventSchema.parse(JSON.parse(raw));
}
export function eventKey(connectionId: string, kind: string, data: unknown) {
  return createHash('sha256')
    .update(JSON.stringify([connectionId, kind, data]))
    .digest('hex');
}

export async function ingestWebhook(raw: string, signature: string | null) {
  const parsed = parseWebhook(raw);
  const ids = [
    ...new Set(parsed.entry.flatMap((e) => e.changes.map((c) => c.value.metadata.phone_number_id))),
  ];
  if (!ids.length) throw new HttpError(400, 'invalidWebhook');
  const db = getDb();
  const matches = await db
    .select()
    .from(connections)
    .where(inArray(connections.phoneNumberId, ids));
  if (!matches.length) throw new HttpError(403, 'unknownConnection');
  // Validate every targeted, known connection before storing any part of a batch.
  for (const connection of matches) {
    if (
      !verifySignature(
        raw,
        signature,
        decrypt(connection.appSecretEncrypted, `${connection.id}:secret`),
      )
    )
      throw new HttpError(401, 'invalidSignature');
  }
  let stored = 0;
  await db.transaction(async (tx) => {
    for (const entry of parsed.entry)
      for (const change of entry.changes) {
        const connection = matches.find(
          (c) => c.phoneNumberId === change.value.metadata.phone_number_id && c.wabaId === entry.id,
        );
        if (!connection || change.field !== 'messages') continue;
        for (const message of change.value.messages ?? []) {
          const timestamp = new Date(Number(message.timestamp) * 1000);
          if (!Number.isFinite(timestamp.getTime())) throw new HttpError(400, 'invalidWebhook');
          const inserted = await tx
            .insert(providerEvents)
            .values({
              id: randomUUID(),
              agencyId: connection.agencyId,
              connectionId: connection.id,
              kind: 'message',
              dedupeKey: eventKey(connection.id, 'message', message.id),
              payload: message,
            })
            .onConflictDoNothing()
            .returning({ id: providerEvents.id });
          if (inserted.length) {
            const contactName =
              change.value.contacts
                ?.find((c) => c.wa_id === message.from)
                ?.profile?.name?.slice(0, 120) || message.from;
            await tx
              .insert(conversations)
              .values({
                id: randomUUID(),
                agencyId: connection.agencyId,
                connectionId: connection.id,
                contactPhone: message.from,
                name: contactName,
                lastInboundAt: timestamp,
                lastMessageAt: timestamp,
              })
              .onConflictDoUpdate({
                target: [conversations.connectionId, conversations.contactPhone],
                set: {
                  lastInboundAt: sql`greatest(${conversations.lastInboundAt}, excluded.last_inbound_at)`,
                  lastMessageAt: sql`greatest(${conversations.lastMessageAt}, excluded.last_message_at)`,
                },
              });
            await tx
              .insert(messages)
              .values({
                id: randomUUID(),
                agencyId: connection.agencyId,
                connectionId: connection.id,
                providerMessageId: message.id,
                direction: 'inbound',
                contactPhone: message.from,
                type: message.type,
                body: message.type === 'text' ? (message.text?.body ?? null) : null,
                providerTimestamp: timestamp,
              })
              .onConflictDoNothing();
            stored++;
          }
        }
        for (const status of change.value.statuses ?? []) {
          await tx
            .insert(providerEvents)
            .values({
              id: randomUUID(),
              agencyId: connection.agencyId,
              connectionId: connection.id,
              kind: 'status',
              dedupeKey: eventKey(connection.id, 'status', status),
              payload: status,
            })
            .onConflictDoNothing();
          const ranks: Record<string, number> = { sent: 2, failed: 3, delivered: 4, read: 5 };
          const rank = ranks[status.status];
          if (rank)
            await tx
              .update(messages)
              .set({
                providerMessageId: status.id,
                deliveryStatus: sql`case when (case ${messages.deliveryStatus} when 'read' then 5 when 'delivered' then 4 when 'failed' then 3 when 'sent' then 2 else 0 end) < ${rank} then ${status.status} else ${messages.deliveryStatus} end`,
              })
              .where(
                and(
                  eq(messages.connectionId, connection.id),
                  eq(messages.direction, 'outbound'),
                  or(
                    eq(messages.providerMessageId, status.id),
                    status.biz_opaque_callback_data
                      ? eq(messages.id, status.biz_opaque_callback_data)
                      : undefined,
                  ),
                ),
              );
        }
        await tx
          .update(connections)
          .set({ lastWebhookAt: new Date(), status: 'receiving' })
          .where(eq(connections.id, connection.id));
      }
  });
  return stored;
}
