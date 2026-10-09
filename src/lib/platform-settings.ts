import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { platformSettings } from '@/db/schema';
import type { BusinessChatOfferMode } from './offer-follow-up-types';

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];
const settingsId = 'platform';

export async function businessChatOfferMode(
  executor: ReturnType<typeof getDb> | Transaction = getDb(),
): Promise<BusinessChatOfferMode> {
  const [row] = await executor
    .select({ mode: platformSettings.businessChatOffers })
    .from(platformSettings)
    .where(eq(platformSettings.id, settingsId));
  return row?.mode === 'businessFirst' ? 'businessFirst' : 'immediate';
}

export async function setBusinessChatOfferMode(mode: BusinessChatOfferMode, userId: string) {
  await getDb()
    .insert(platformSettings)
    .values({ id: settingsId, businessChatOffers: mode, updatedBy: userId })
    .onConflictDoUpdate({
      target: platformSettings.id,
      set: { businessChatOffers: mode, updatedBy: userId, updatedAt: new Date() },
    });
}
