import { z } from 'zod';
import { HttpError, requirePlatformAdmin } from '@/lib/access';
import { apiError, bodyJson, checkOrigin } from '@/lib/http';
import { cancelCampaign, launchCampaign, prepareTemplate } from '@/lib/campaigns';
import { wakeAutomation } from '@/lib/automation';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request);
    await requirePlatformAdmin();
    const { id } = await params;
    const input = z
      .discriminatedUnion('action', [
        z.object({ action: z.literal('template'), templateId: z.string().min(1) }),
        z.object({
          action: z.literal('send'),
          mode: z.enum(['template', 'reply']).default('template'),
        }),
        z.object({ action: z.literal('cancel') }),
      ])
      .parse(await bodyJson(request));
    if (input.action === 'template') await prepareTemplate(id, input.templateId);
    if (input.action === 'send') await launchCampaign(id, input.mode);
    if (input.action === 'cancel') await cancelCampaign(id);
    await wakeAutomation();
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof HttpError && error.code === 'audienceChanged') await wakeAutomation();
    return apiError(error);
  }
}
