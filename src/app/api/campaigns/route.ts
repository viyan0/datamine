import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { campaigns, memberships } from '@/db/schema';
import { requireAgency, requireSession, HttpError } from '@/lib/access';
import { apiError, bodyJson, checkOrigin } from '@/lib/http';
import { listCampaigns } from '@/lib/campaigns';
import { analysisConfigured } from '@/lib/anthropic';
export async function GET() {
  try {
    const session = await requireSession();
    const own = await getDb()
      .select({ id: memberships.agencyId })
      .from(memberships)
      .where(eq(memberships.userId, session.user.id));
    return Response.json(
      {
        configured: analysisConfigured(),
        campaigns: await listCampaigns(
          own.map((m) => m.id),
          session.user.platformRole === 'admin',
        ),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const input = z
      .object({
        agencyId: z.string().min(1),
        title: z.string().trim().min(2).max(100),
        offerText: z.string().trim().min(10).max(3000),
        locale: z.enum(['en', 'ar', 'ckb']),
      })
      .parse(await bodyJson(request));
    const { session, membership } = await requireAgency(input.agencyId);
    if (!['owner', 'admin', 'agent'].includes(membership.role))
      throw new HttpError(403, 'forbidden');
    const id = randomUUID();
    await getDb()
      .insert(campaigns)
      .values({ id, ...input, createdBy: session.user.id });
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
