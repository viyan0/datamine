import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/access';
import { apiError, bodyJson, checkOrigin } from '@/lib/http';
import { businessChatOfferModes } from '@/lib/offer-follow-up-types';
import { businessChatOfferMode, setBusinessChatOfferMode } from '@/lib/platform-settings';

export async function GET() {
  try {
    await requirePlatformAdmin();
    return Response.json(
      { businessChatOffers: await businessChatOfferMode() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const session = await requirePlatformAdmin();
    const { businessChatOffers } = z
      .object({ businessChatOffers: z.enum(businessChatOfferModes) })
      .parse(await bodyJson(request));
    await setBusinessChatOfferMode(businessChatOffers, session.user.id);
    return Response.json({ businessChatOffers });
  } catch (error) {
    return apiError(error);
  }
}
