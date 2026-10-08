import { requirePlatformAdmin } from '@/lib/access';
import { apiError } from '@/lib/http';
import { listSharedProfiles } from '@/lib/enrollment';
export async function GET() {
  try {
    await requirePlatformAdmin();
    return Response.json(
      { profiles: await listSharedProfiles() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
