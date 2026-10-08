import { z } from 'zod';
import { HttpError, requireAgency } from '@/lib/access';
import { apiError, bodyJson, checkOrigin } from '@/lib/http';
import { createEnrollmentLink } from '@/lib/enrollment';
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
    const { locale } = z
      .object({ locale: z.enum(['en', 'ar', 'ckb']) })
      .parse(await bodyJson(request));
    return Response.json(await createEnrollmentLink(id, conversationId, locale), {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return apiError(error);
  }
}
