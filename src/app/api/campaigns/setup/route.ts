import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { connections } from '@/db/schema';
import { requireAgency, requirePlatformAdmin, HttpError } from '@/lib/access';
import { apiError, bodyJson, checkOrigin } from '@/lib/http';
import { senderTemplates } from '@/lib/campaigns';
export async function GET() {
  try {
    await requirePlatformAdmin();
    return Response.json(await senderTemplates(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    await requirePlatformAdmin();
    const { id } = z.object({ id: z.string().min(1) }).parse(await bodyJson(request));
    const [selected] = await getDb().select().from(connections).where(eq(connections.id, id));
    if (!selected) throw new HttpError(404, 'notFound');
    await requireAgency(selected.agencyId, true);
    await getDb().transaction(async (tx) => {
      await tx
        .select({ id: connections.id })
        .from(connections)
        .orderBy(connections.id)
        .for('update');
      await tx.update(connections).set({ campaignSender: false });
      await tx.update(connections).set({ campaignSender: true }).where(eq(connections.id, id));
    });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
