import { requireSession } from '@/lib/access';
import { apiError } from '@/lib/http';
import { listSharedProfiles } from '@/lib/enrollment';
export async function GET() {
  try {
    const session = await requireSession();
    return Response.json(
      { profiles: await listSharedProfiles(session.user) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
