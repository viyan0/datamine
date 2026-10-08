import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { connections, providerEvents, messages } from '@/db/schema';
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
                    .object({ id: z.string(), status: z.string(), timestamp: z.string() })
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
        }
        await tx
          .update(connections)
          .set({ lastWebhookAt: new Date(), status: 'receiving' })
          .where(eq(connections.id, connection.id));
      }
  });
  return stored;
}
