import { z } from 'zod';
import { HttpError, requireAgency } from '@/lib/access';
import { apiError, bodyJson, checkOrigin } from '@/lib/http';
import { replyToConversation } from '@/lib/inbox';
import { wakeAutomation } from '@/lib/automation';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; conversationId: string }> },
) {
  try {
    checkOrigin(request);
    const { id, conversationId } = await params;
    const { membership } = await requireAgency(id);
    if (!['owner', 'admin', 'agent'].includes(membership.role))
      throw new HttpError(403, 'forbidden');
    const { body, requestId } = z
      .object({ body: z.string().trim().min(1).max(4096), requestId: z.uuid() })
      .parse(await bodyJson(request));
    const message = await replyToConversation(id, conversationId, body, requestId);
    await wakeAutomation();
    return Response.json({ message });
  } catch (error) {
    return apiError(error);
  }
}
