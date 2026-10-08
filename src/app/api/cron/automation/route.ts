import { nextAutomationDelay, wakeAutomation } from '@/lib/automation';
import { secureEqual } from '@/lib/security';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !secureEqual(request.headers.get('authorization') || '', `Bearer ${secret}`))
    return new Response('Unauthorized', { status: 401 });
  if ((await nextAutomationDelay()) !== null) await wakeAutomation(true);
  return Response.json({ ok: true });
}
