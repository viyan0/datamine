import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getDb } from '@/db';
import { agencies, auditEvents } from '@/db/schema';
import { requirePlatformAdmin } from '@/lib/access';
import { apiError, bodyJson, checkOrigin } from '@/lib/http';
import { businessSettingsSchema } from '@/lib/business';
const schema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(60),
  locale: z.enum(['en', 'ar', 'ckb']),
});
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const session = await requirePlatformAdmin();
    const input = schema.extend(businessSettingsSchema.shape).parse(await bodyJson(request)),
      id = randomUUID();
    await getDb().transaction(async (tx) => {
      await tx.insert(agencies).values({ ...input, id });
      await tx.insert(auditEvents).values({
        id: randomUUID(),
        agencyId: id,
        actorId: session.user.id,
        action: 'agencyCreated',
      });
    });
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
