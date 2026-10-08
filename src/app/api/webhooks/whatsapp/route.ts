import { ingestWebhook } from '@/lib/webhook';
import { secureEqual } from '@/lib/security';
import { requiredSecret } from '@/lib/config';
import { HttpError } from '@/lib/access';
import { ZodError } from 'zod';
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (
    url.searchParams.get('hub.mode') === 'subscribe' &&
    secureEqual(
      url.searchParams.get('hub.verify_token') ?? '',
      requiredSecret('WHATSAPP_VERIFY_TOKEN'),
    )
  ) {
    return new Response(url.searchParams.get('hub.challenge') ?? '', {
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  return new Response('Forbidden', { status: 403 });
}
export async function POST(request: Request) {
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 1_000_000) return new Response('Payload too large', { status: 413 });
  try {
    await ingestWebhook(raw, request.headers.get('x-hub-signature-256'));
    return Response.json({ received: true });
  } catch (error) {
    if (error instanceof HttpError)
      return Response.json({ error: error.code }, { status: error.status });
    if (error instanceof ZodError || error instanceof SyntaxError)
      return Response.json({ error: 'invalidWebhook' }, { status: 400 });
    console.error('Webhook persistence failed');
    return Response.json({ error: 'retry' }, { status: 503 });
  }
}
