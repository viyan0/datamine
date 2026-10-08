import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { agencies, conversations } from '@/db/schema';
import { requireAgency } from '@/lib/access';
import { businessSettingsSchema } from '@/lib/business';
import { apiError, bodyJson, checkOrigin } from '@/lib/http';
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request);
    const { id } = await params;
    await requireAgency(id, true);
    const fields = businessSettingsSchema.parse(await bodyJson(request));
    await getDb().transaction(async (tx) => {
      await tx.update(agencies).set(fields).where(eq(agencies.id, id));
      await tx
        .update(conversations)
        .set({
          analysisDueAt: new Date(),
          analysisStatus: 'pending',
          analysisError: null,
          analysisAttempts: 0,
          analysisRevision: sql`${conversations.analysisRevision} + 1`,
        })
        .where(eq(conversations.agencyId, id));
    });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
