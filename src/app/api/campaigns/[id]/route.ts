import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { campaigns } from '@/db/schema';
import { HttpError, requireAgency, requireSession } from '@/lib/access';
import { apiError, bodyJson, checkOrigin } from '@/lib/http';
import { cancelCampaign, launchCampaign, prepareTemplate, publishCampaign } from '@/lib/campaigns';
import { wakeAutomation } from '@/lib/automation';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request);
    const session = await requireSession();
    const { id } = await params;
    const [campaign] = await getDb()
      .select({ agencyId: campaigns.agencyId, catalogOnly: campaigns.catalogOnly })
      .from(campaigns)
      .where(eq(campaigns.id, id));
    if (!campaign || campaign.catalogOnly) throw new HttpError(404, 'notFound');
    await requireAgency(campaign.agencyId, true);
    const input = z
      .discriminatedUnion('action', [
        z.object({ action: z.literal('template'), templateId: z.string().min(1) }),
        z.object({
          action: z.literal('send'),
          mode: z.enum(['template', 'reply']).default('template'),
        }),
        z.object({ action: z.literal('cancel') }),
        z.object({
          action: z.literal('network'),
          enabled: z.boolean(),
          expiresAt: z.string().max(40).nullable().optional(),
        }),
      ])
      .parse(await bodyJson(request));
    if (input.action === 'template')
      await prepareTemplate(id, input.templateId, session.user.platformRole === 'admin');
    if (input.action === 'send') await launchCampaign(id, input.mode);
    if (input.action === 'cancel') await cancelCampaign(id);
    if (input.action === 'network') await publishCampaign(id, input.enabled, input.expiresAt);
    await wakeAutomation();
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof HttpError && error.code === 'audienceChanged') await wakeAutomation();
    return apiError(error);
  }
}
