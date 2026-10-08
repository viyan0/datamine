import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { conversations } from '@/db/schema';
import { requireAgency, HttpError } from '@/lib/access';
import { apiError, bodyJson, checkOrigin } from '@/lib/http';
import { conversationMessages, getConversation } from '@/lib/inbox';
import { inquiryStatuses, services } from '@/lib/inbox-types';
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
    await getConversation(id, conversationId);
    const fields = z
      .object({
        name: z.string().trim().min(1).max(120),
        service: z.enum(services),
        destination: z.string().trim().max(160),
        inquiryStatus: z.enum(inquiryStatuses),
        note: z.string().trim().max(2000),
      })
      .parse(await bodyJson(request));
    await getDb()
      .update(conversations)
      .set(fields)
      .where(and(eq(conversations.id, conversationId), eq(conversations.agencyId, id)));
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
