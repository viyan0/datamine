import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getDb } from '@/db';
import { invitations, auditEvents } from '@/db/schema';
import { requireAgency } from '@/lib/access';
import { apiError, bodyJson, checkOrigin } from '@/lib/http';
import { digest, roles } from '@/lib/security';
import { appUrl } from '@/lib/config';
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const input = z
      .object({
        agencyId: z.string().uuid(),
        email: z
          .email()
          .max(254)
          .transform((v) => v.toLowerCase()),
        role: z.enum(roles),
        locale: z.enum(['en', 'ar', 'ckb']).default('en'),
      })
      .parse(await bodyJson(request));
    const { session } = await requireAgency(input.agencyId, true);
    const token = randomBytes(32).toString('hex');
    await getDb().transaction(async (tx) => {
      await tx
        .insert(invitations)
        .values({
          id: randomUUID(),
          agencyId: input.agencyId,
          email: input.email,
          role: input.role,
          tokenHash: digest(token),
          createdBy: session.user.id,
          expiresAt: new Date(Date.now() + 48 * 3600_000),
        });
      await tx
        .insert(auditEvents)
        .values({
          id: randomUUID(),
          agencyId: input.agencyId,
          actorId: session.user.id,
          action: 'invitationCreated',
        });
    });
    // The token stays in the URL fragment; it is not sent in requests or referrers.
    return Response.json(
      { url: `${appUrl()}/${input.locale}/invite#${token}` },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
