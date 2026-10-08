import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
function keys(object: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(object)
    .flatMap(([key, value]) =>
      typeof value === 'object' && value !== null
        ? keys(value as Record<string, unknown>, `${prefix}${key}.`)
        : [`${prefix}${key}`],
    )
    .sort();
}
test('Arabic and Sorani cover all interface strings', async () => {
  const en = JSON.parse(await readFile('./messages/en.json', 'utf8'));
  for (const locale of ['ar', 'ckb'])
    assert.deepEqual(
      keys(JSON.parse(await readFile(`./messages/${locale}.json`, 'utf8'))),
      keys(en),
    );
});
