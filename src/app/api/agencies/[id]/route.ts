import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { agencies } from '@/db/schema';
import { requireAgency } from '@/lib/access';
import { businessSettingsSchema } from '@/lib/business';
import { apiError, bodyJson, checkOrigin } from '@/lib/http';
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request);
    const { id } = await params;
    await requireAgency(id, true);
    const fields = businessSettingsSchema.parse(await bodyJson(request));
    await getDb().update(agencies).set(fields).where(eq(agencies.id, id));
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
