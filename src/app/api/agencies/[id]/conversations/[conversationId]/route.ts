import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { conversations } from '@/db/schema';
import { requireAgency, HttpError } from '@/lib/access';
import { apiError, bodyJson, checkOrigin } from '@/lib/http';
import { conversationMessages } from '@/lib/inbox';
import { inquiryStatuses } from '@/lib/inbox-types';
import { categorySchema } from '@/lib/business';
type Context = { params: Promise<{ id: string; conversationId: string }> };
export async function GET(_request: Request, { params }: Context) {
  try {
    const { id, conversationId } = await params;
    await requireAgency(id);
    return Response.json(
      { messages: await conversationMessages(id, conversationId) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function PATCH(request: Request, { params }: Context) {
  try {
    checkOrigin(request);
    const { id, conversationId } = await params;
    const { membership } = await requireAgency(id);
    if (!['owner', 'admin', 'agent'].includes(membership.role))
      throw new HttpError(403, 'forbidden');
    const input = await bodyJson(request);
    const reset = z.object({ automatic: z.literal(true) }).safeParse(input);
    if (reset.success) {
      const [row] = await getDb()
        .update(conversations)
        .set({
          manualFields: [],
          analysis: null,
          analysisStatus: 'pending',
          analysisDueAt: new Date(),
          analysisAttempts: 0,
          analysisRevision: sql`${conversations.analysisRevision} + 1`,
        })
        .where(and(eq(conversations.id, conversationId), eq(conversations.agencyId, id)))
        .returning({ id: conversations.id });
      if (!row) throw new HttpError(404, 'notFound');
      return Response.json({ ok: true });
    }
    const fields = z
      .object({
        name: z.string().trim().min(1).max(120),
        service: categorySchema,
        destination: z.string().trim().max(160),
        inquiryStatus: z.enum(inquiryStatuses),
        note: z.string().trim().max(2000),
      })
      .partial()
      .parse(input);
    await getDb().transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, conversationId), eq(conversations.agencyId, id)))
        .for('update');
      if (!current) throw new HttpError(404, 'notFound');
      const changed = (['service', 'destination', 'inquiryStatus'] as const).filter(
        (field) => fields[field] !== undefined && current[field] !== fields[field],
      );
      await tx
        .update(conversations)
        .set({ ...fields, manualFields: [...new Set([...current.manualFields, ...changed])] })
        .where(eq(conversations.id, conversationId));
    });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
