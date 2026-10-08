import { requireAgency } from '@/lib/access';
import { apiError } from '@/lib/http';
import { listConversations } from '@/lib/inbox';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireAgency(id);
    return Response.json(
      { conversations: await listConversations(id) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
