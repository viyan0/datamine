import { processPendingAnalysis } from '@/lib/analysis';
import { processCampaigns } from '@/lib/campaigns';
import {
  automationQueue,
  automationToken,
  automationTopic,
  nextAutomationDelay,
} from '@/lib/automation';
import { secureEqual } from '@/lib/security';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const POST = automationQueue.handleCallback(
  async (message: { token?: string }, metadata) => {
    if (process.env.VERCEL !== '1' || process.env.AUTOMATION_DISABLED === 'true') return;
    if (typeof message?.token !== 'string' || !secureEqual(message.token, automationToken()))
      throw new Error('Invalid automation message');
    await Promise.all([processPendingAnalysis(2), processCampaigns()]);
    const delaySeconds = await nextAutomationDelay();
    if (delaySeconds !== null) {
      await automationQueue.send(
        automationTopic,
        { token: automationToken() },
        {
          delaySeconds,
          // A retried delivery cannot publish the same successor twice.
          idempotencyKey: `${metadata.messageId}:next`,
        },
      );
    }
  },
  { retry: () => ({ afterSeconds: 30 }) },
);
