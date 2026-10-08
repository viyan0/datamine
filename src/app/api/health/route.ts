import { getPool } from '@/db';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    await getPool().query('SELECT 1 FROM users LIMIT 1');
    return Response.json(
      { status: 'ok', database: 'connected', phase: 5 },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json({ status: 'unavailable', database: 'unavailable' }, { status: 503 });
  }
}
