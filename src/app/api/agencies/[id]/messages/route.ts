import { requireAgency } from '@/lib/access';
import { apiError } from '@/lib/http';
import { listAgencyMessages } from '@/lib/workspace';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireAgency(id);
    return Response.json(
      { messages: await listAgencyMessages(id) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
