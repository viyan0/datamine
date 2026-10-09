import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { campaigns, memberships } from '@/db/schema';
import { requireAgency, requireSession, HttpError } from '@/lib/access';
import { apiError, bodyJson, checkOrigin } from '@/lib/http';
import { listCampaigns, networkAvailability } from '@/lib/campaigns';
import { analysisConfigured } from '@/lib/anthropic';
import { wakeAutomation } from '@/lib/automation';
import { getActiveProduct } from '@/lib/products';
import { productOfferText } from '@/lib/product-types';
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
        productId: z.string().min(1).optional(),
        title: z.string().trim().min(2).max(100).optional(),
        offerText: z.string().trim().min(10).max(3000).optional(),
        locale: z.enum(['en', 'ar', 'ckb']),
        networkEnabled: z.boolean().default(false),
        networkExpiresAt: z.string().max(40).nullable().optional(),
      })
      .refine((input) => !!input.productId || (!!input.title && !!input.offerText))
      .parse(await bodyJson(request));
    const { session, membership } = await requireAgency(input.agencyId, true);
    if (!['owner', 'admin'].includes(membership.role)) throw new HttpError(403, 'forbidden');
    const id = randomUUID();
    await getDb().transaction(async (tx) => {
      const product = input.productId
        ? await getActiveProduct(input.agencyId, input.productId, tx)
        : null;
      await tx.insert(campaigns).values({
        id,
        ...input,
        title: product ? product.name : input.title!,
        offerText: product ? productOfferText(product, input.locale) : input.offerText!,
        ...networkAvailability(input.networkEnabled, input.networkExpiresAt),
        createdBy: session.user.id,
      });
    });
    await wakeAutomation();
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
