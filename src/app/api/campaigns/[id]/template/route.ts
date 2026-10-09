import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { agencies, campaigns } from '@/db/schema';
import { requireAgency, requireSession, HttpError } from '@/lib/access';
import { apiError, bodyJson, checkOrigin } from '@/lib/http';
import { attachCampaignTemplate, campaignSender } from '@/lib/campaigns';
import { createMarketingTemplate, templateBodySchema, TemplateError } from '@/lib/meta-templates';
import { draftOfferTemplate } from '@/lib/template-draft';
import { AnalysisError } from '@/lib/anthropic';
import { decrypt } from '@/lib/security';
import { wakeAutomation } from '@/lib/automation';

export const maxDuration = 60;
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request);
    await requireSession();
    const { id } = await params;
    const input = z
      .discriminatedUnion('action', [
        z.object({ action: z.literal('draft') }),
        z.object({ action: z.literal('submit'), body: templateBodySchema }),
      ])
      .parse(await bodyJson(request));
    const [row] = await getDb()
      .select({ campaign: campaigns, businessName: agencies.name })
      .from(campaigns)
      .innerJoin(agencies, eq(agencies.id, campaigns.agencyId))
      .where(and(eq(campaigns.id, id), inArray(campaigns.status, ['ready', 'matching', 'error'])));
    if (!row || row.campaign.catalogOnly) throw new HttpError(409, 'campaignLocked');
    const c = row.campaign;
    await requireAgency(c.agencyId, true);
    if (input.action === 'draft')
      return Response.json(
        await draftOfferTemplate({
          title: c.title,
          offerText: c.offerText,
          locale: c.locale,
          businessName: row.businessName,
        }),
      );
    const sender = await campaignSender(c.agencyId, c.senderId);
    if (!sender) throw new HttpError(409, 'campaignSenderMissing');
    const template = await createMarketingTemplate({
      wabaId: sender.wabaId,
      token: decrypt(sender.accessTokenEncrypted, `${sender.id}:token`),
      campaignId: c.id,
      language: c.locale,
      body: templateBodySchema.parse(
        input.body.toLocaleLowerCase().includes(row.businessName.toLocaleLowerCase())
          ? input.body
          : `Datamine · ${row.businessName}\n\n${input.body}`,
      ),
    });
    await attachCampaignTemplate(c.id, template, sender.id);
    await wakeAutomation();
    return Response.json({ template }, { status: 201 });
  } catch (error) {
    if (error instanceof TemplateError)
      return Response.json({ error: error.code, detail: error.detail }, { status: error.status });
    if (error instanceof AnalysisError)
      return Response.json({ error: error.code }, { status: error.status });
    return apiError(error);
  }
}
