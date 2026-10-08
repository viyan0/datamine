import { requirePlatformAdmin } from '@/lib/access';
import { apiError } from '@/lib/http';
import { appUrl, requiredSecret } from '@/lib/config';
export async function GET() {
  try {
    await requirePlatformAdmin();
    return Response.json(
      {
        callbackUrl: `${appUrl()}/api/webhooks/whatsapp`,
        verifyToken: requiredSecret('WHATSAPP_VERIFY_TOKEN'),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
