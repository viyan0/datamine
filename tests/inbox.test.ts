import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replyWindowOpen } from '../src/lib/inbox-types';
test('reply window rejects expired, future, and invalid timestamps at the exact boundary', () => {
  const now = Date.parse('2026-10-08T12:00:00Z');
  assert.equal(replyWindowOpen('2026-10-07T12:00:01Z', now), true);
  assert.equal(replyWindowOpen('2026-10-07T12:00:00Z', now), false);
  assert.equal(replyWindowOpen('2026-10-08T12:00:01Z', now), false);
  assert.equal(replyWindowOpen('invalid', now), false);
});
