import { processConsentReplies } from '../src/lib/consent';
import { getPool } from '../src/db';
import { processPendingAnalysis } from '../src/lib/analysis';
import { processCampaigns } from '../src/lib/campaigns';
import { processRecommendations } from '../src/lib/recommendations';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
let stopping = false,
  wake: (() => void) | undefined;
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    stopping = true;
    wake?.();
  });
console.log('Automatic conversation analysis and campaign processing ready.');
while (!stopping) {
  try {
    await processConsentReplies(2);
    await processPendingAnalysis(1);
    await processRecommendations(1);
    await processCampaigns(2);
  } catch {
    console.error('Automation will retry after a database or provider error.');
  }
  if (!stopping)
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 2000);
      wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });
}
await getPool().end();
