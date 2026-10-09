import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getDb } from '@/db';
import { connections, auditEvents } from '@/db/schema';
import { requireAgency, requirePlatformAdmin } from '@/lib/access';
import { apiError, bodyJson, checkOrigin } from '@/lib/http';
import { encrypt } from '@/lib/security';
import { verifyMetaNumber } from '@/lib/meta';
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    await requirePlatformAdmin();
    const input = z
      .object({
        agencyId: z.string().uuid(),
        label: z.string().trim().min(2).max(80),
        phoneNumberId: z.string().regex(/^\d{5,30}$/),
        wabaId: z.string().regex(/^\d{5,30}$/),
        accessToken: z.string().trim().min(20).max(4000),
        appSecret: z
          .string()
          .trim()
          .regex(/^[a-f0-9]{32}$/i),
      })
      .parse(await bodyJson(request));
    const { session } = await requireAgency(input.agencyId, true);
    const phone = await verifyMetaNumber(input),
      id = randomUUID();
    await getDb().transaction(async (tx) => {
      await tx.insert(connections).values({
        id,
        agencyId: input.agencyId,
        label: input.label,
        phoneNumberId: input.phoneNumberId,
        wabaId: input.wabaId,
        displayPhone: phone.display_phone_number,
        accessTokenEncrypted: encrypt(input.accessToken, `${id}:token`),
        appSecretEncrypted: encrypt(input.appSecret, `${id}:secret`),
        verifiedAt: new Date(),
      });
      await tx.insert(auditEvents).values({
        id: randomUUID(),
        agencyId: input.agencyId,
        actorId: session.user.id,
        action: 'connectionAdded',
      });
    });
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
