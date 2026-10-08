import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { encrypt, decrypt, verifySignature, secureEqual, canManage } from '../src/lib/security';
process.env.CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString('hex');
test('credentials are authenticated and bound to their connection', () => {
  const encrypted = encrypt('private-token', 'connection-1:token');
  assert.equal(decrypt(encrypted, 'connection-1:token'), 'private-token');
  assert.notEqual(encrypted, encrypt('private-token', 'connection-1:token'));
  assert.throws(() => decrypt(encrypted, 'connection-2:token'));
  const segments = encrypted.split('.');
  segments[3] = Buffer.from('tampered').toString('base64');
  assert.throws(() => decrypt(segments.join('.'), 'connection-1:token'));
});
test('webhook signatures reject tampering, missing headers, and another app secret', () => {
  const raw = '{"test":true}',
    secret = 'app-secret';
  const signature = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
  assert.equal(verifySignature(raw, signature, secret), true);
  assert.equal(verifySignature(raw + ' ', signature, secret), false);
  assert.equal(verifySignature(raw, signature, 'other-app'), false);
  assert.equal(verifySignature(raw, null, secret), false);
  assert.equal(verifySignature(raw, 'sha256=invalid', secret), false);
  assert.equal(secureEqual('token', 'tokens'), false);
});
test('viewers and agents cannot manage connections or staff', () => {
  assert.equal(canManage('viewer'), false);
  assert.equal(canManage('agent'), false);
  assert.equal(canManage(undefined), false);
  assert.equal(canManage('owner'), true);
  assert.equal(canManage('admin'), true);
});
