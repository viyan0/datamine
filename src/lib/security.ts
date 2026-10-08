import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { requiredSecret } from './config';
export function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
export function secureEqual(a: string, b: string) {
  return timingSafeEqual(
    createHash('sha256').update(a).digest(),
    createHash('sha256').update(b).digest(),
  );
}
function key() {
  const k = requiredSecret('CREDENTIAL_ENCRYPTION_KEY');
  if (!/^[a-f0-9]{64}$/i.test(k))
    throw new Error('CREDENTIAL_ENCRYPTION_KEY must be 64 hex characters');
  return Buffer.from(k, 'hex');
}
export function encrypt(value: string, context: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    encrypted.toString('base64'),
  ].join('.');
}
export function decrypt(value: string, context: string) {
  const [version, iv, tag, data] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Invalid encrypted credential');
  const cipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  cipher.setAAD(Buffer.from(context));
  cipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([cipher.update(Buffer.from(data, 'base64')), cipher.final()]).toString(
    'utf8',
  );
}
export function verifySignature(body: string, signature: string | null, appSecret: string) {
  if (!signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  return secureEqual(
    signature,
    `sha256=${createHmac('sha256', appSecret).update(body).digest('hex')}`,
  );
}
export const roles = ['admin', 'agent', 'viewer'] as const;
export type Role = (typeof roles)[number];
export function canManage(role: string | undefined) {
  return role === 'owner' || role === 'admin';
}
