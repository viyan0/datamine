import { ZodError } from 'zod';
import { HttpError } from './access';
import { appUrl } from './config';
export function checkOrigin(request: Request) {
  if (request.headers.get('origin') !== new URL(appUrl()).origin)
    throw new HttpError(403, 'invalidOrigin');
}
export async function bodyJson(request: Request) {
  const text = await request.text();
  if (text.length > 20000) throw new HttpError(413, 'invalidInput');
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'invalidInput');
  }
}
export function apiError(error: unknown) {
  if (error instanceof HttpError)
    return Response.json({ error: error.code }, { status: error.status });
  if (error instanceof ZodError) return Response.json({ error: 'invalidInput' }, { status: 400 });
  if (typeof error === 'object' && error && 'code' in error && error.code === '23505')
    return Response.json({ error: 'alreadyExists' }, { status: 409 });
  console.error('Request failed', error instanceof Error ? error.name : 'UnknownError');
  return Response.json({ error: 'serverError' }, { status: 500 });
}
