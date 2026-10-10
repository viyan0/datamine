import { z } from 'zod';
import { requireInbox, HttpError } from '@/lib/access';
import { apiError, bodyJson, checkOrigin } from '@/lib/http';
import { conversationMessages, updateConversationDetails } from '@/lib/inbox';
import { inquiryStatuses } from '@/lib/inbox-types';
import { categorySchema } from '@/lib/business';
import { wakeAutomation } from '@/lib/automation';
type Context = { params: Promise<{ id: string; conversationId: string }> };
export async function GET(_request: Request, { params }: Context) {
  try {
    const { id, conversationId } = await params;
    await requireInbox(id);
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
    const { membership } = await requireInbox(id);
    if (!['owner', 'admin', 'agent'].includes(membership.role))
      throw new HttpError(403, 'forbidden');
    const input = await bodyJson(request);
    const reset = z.object({ automatic: z.literal(true) }).safeParse(input);
    if (reset.success) {
      await updateConversationDetails(id, conversationId, { automatic: true });
      await wakeAutomation();
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
    if (await updateConversationDetails(id, conversationId, fields)) await wakeAutomation();
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
