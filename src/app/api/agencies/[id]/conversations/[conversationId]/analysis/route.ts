import { z } from 'zod';
import { HttpError, requireAgency } from '@/lib/access';
import { apiError, bodyJson, checkOrigin } from '@/lib/http';
import { analyzeConversation, getAnalysisState } from '@/lib/analysis';
import { AnalysisError } from '@/lib/anthropic';
type Context = { params: Promise<{ id: string; conversationId: string }> };
export async function GET(_request: Request, { params }: Context) {
  try {
    const { id, conversationId } = await params;
    await requireAgency(id);
    return Response.json(await getAnalysisState(id, conversationId), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request, { params }: Context) {
  try {
    checkOrigin(request);
    const { id, conversationId } = await params;
    const { membership } = await requireAgency(id);
    if (!['owner', 'admin', 'agent'].includes(membership.role))
      throw new HttpError(403, 'forbidden');
    const { locale } = z
      .object({ locale: z.enum(['en', 'ar', 'ckb']) })
      .parse(await bodyJson(request));
    return Response.json(
      { analysis: await analyzeConversation(id, conversationId, locale) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof AnalysisError) return apiError(new HttpError(error.status, error.code));
    return apiError(error);
  }
}
