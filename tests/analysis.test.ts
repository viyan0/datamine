import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAnalysis, analyzeWithHaiku, AnalysisError } from '../src/lib/anthropic';
import { demoMessages } from '../src/lib/demo-inbox';
import { sampleAnalyses } from '../src/lib/demo-analysis';
import type { SourceMessage } from '../src/lib/analysis-types';
const source: SourceMessage[] = demoMessages['sample-ava'].map((m) => ({
  id: m.id,
  body: m.body!,
  direction: m.direction,
  timestamp: m.timestamp,
}));
const { copyKey: _copy, ...sample } = sampleAnalyses['sample-ava'];
void _copy;
const valid = {
  ...sample,
  services: ['flight', 'visa'],
  summary: 'Two travelers want a flight and visa.',
  nextStep: 'Confirm the year.',
  reviewNote: null,
};
test('analysis keeps multiple services and missing facts; rejects invented or staff-only evidence', () => {
  const parsed = validateAnalysis(valid, source);
  assert.deepEqual(parsed.services, ['flight', 'visa']);
  assert.equal(parsed.facts.budget, null);
  assert.throws(
    () =>
      validateAnalysis(
        {
          ...valid,
          facts: {
            ...valid.facts,
            destination: { value: 'Dubai', quote: 'Dubai', messageId: 'sample-msg-1' },
          },
        },
        source,
      ),
    AnalysisError,
  );
  assert.throws(
    () =>
      validateAnalysis(
        {
          ...valid,
          facts: {
            ...valid.facts,
            destination: { value: 'Hi Ava', quote: 'Hi Ava', messageId: 'sample-msg-2' },
          },
        },
        source,
      ),
    AnalysisError,
  );
  assert.throws(
    () => validateAnalysis({ ...valid, intent: 'confirmedBooking' }, source),
    AnalysisError,
  );
  assert.throws(
    () => validateAnalysis({ ...valid, services: ['unsupported'] }, source),
    AnalysisError,
  );
});
test('Haiku request uses the fixed model and strict JSON; refuses failures without fallback', async () => {
  const originalFetch = globalThis.fetch,
    originalKey = process.env.ANTHROPIC_API_KEY,
    originalModel = process.env.ANTHROPIC_MODEL;
  process.env.ANTHROPIC_API_KEY = 'unit-test-only';
  process.env.ANTHROPIC_MODEL = 'claude-haiku-5-5';
  let stop = 'end_turn',
    status = 200,
    calls = 0,
    malformed = false;
  globalThis.fetch = async (input, init) => {
    calls++;
    assert.equal(input, 'https://api.anthropic.com/v1/messages');
    const payload = JSON.parse(String(init?.body));
    assert.equal(payload.model, 'claude-haiku-5-5');
    assert.equal(payload.output_config.format.type, 'json_schema');
    assert.equal(payload.output_config.format.schema.additionalProperties, false);
    assert.equal(payload.tools, undefined);
    assert.ok(payload.system.includes('Sorani Kurdish'));
    return Response.json(
      {
        stop_reason: stop,
        content: [{ type: 'text', text: malformed ? 'not JSON' : JSON.stringify(valid) }],
        usage: { input_tokens: 150, output_tokens: 90 },
      },
      { status },
    );
  };
  try {
    assert.equal((await analyzeWithHaiku(source, 'ckb')).inputTokens, 150);
    stop = 'max_tokens';
    await assert.rejects(analyzeWithHaiku(source, 'ckb'), { code: 'analysisInvalid' });
    stop = 'refusal';
    await assert.rejects(analyzeWithHaiku(source, 'ckb'), { code: 'analysisInvalid' });
    stop = 'end_turn';
    malformed = true;
    await assert.rejects(analyzeWithHaiku(source, 'ckb'), { code: 'analysisInvalid' });
    status = 429;
    await assert.rejects(analyzeWithHaiku(source, 'ckb'), { code: 'analysisRateLimited' });
    status = 503;
    await assert.rejects(analyzeWithHaiku(source, 'ckb'), { code: 'analysisUnavailable' });
    assert.equal(calls, 6);
    process.env.ANTHROPIC_MODEL = 'different-model';
    await assert.rejects(analyzeWithHaiku(source, 'ckb'), { code: 'analysisNotConfigured' });
    assert.equal(calls, 6);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.ANTHROPIC_MODEL;
    else process.env.ANTHROPIC_MODEL = originalModel;
  }
});
