import { QueueClient } from '@vercel/queue';
import { getPool } from '@/db';
import { analysisConfigured } from './anthropic';
import { automationDelay, automationDueSql } from './automation-schedule';
import { digest } from './security';
import { requiredSecret } from './config';

export const automationQueue = new QueueClient({ region: 'fra1' });
export const automationTopic = 'datamine-automation';
export function automationToken() {
  return digest(`${requiredSecret('CRON_SECRET')}:automation`);
}

export async function nextAutomationDelay() {
  const result = await getPool().query<{ due_at: Date | null }>(automationDueSql, [
    analysisConfigured(),
  ]);
  return automationDelay(result.rows[0].due_at);
}

export async function wakeAutomation(strict = false) {
  if (process.env.VERCEL !== '1' || process.env.AUTOMATION_DISABLED === 'true') return;
  try {
    await automationQueue.send(automationTopic, { token: automationToken() }, { delaySeconds: 2 });
  } catch (error) {
    // Webhooks can retry safely. Do not report a successful reply as a failed send.
    // The daily recovery job also picks up persisted work if publishing failed.
    console.error('Automation wake failed; work remains saved in PostgreSQL.');
    if (strict) throw error;
  }
}
