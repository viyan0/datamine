import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAnalysis, analyzeWithHaiku, AnalysisError } from '../src/lib/anthropic';
import { demoMessages } from '../src/lib/demo-inbox';
import { sampleAnalyses } from '../src/lib/demo-analysis';
import type { SourceMessage } from '../src/lib/analysis-types';
const business = { industry: 'Travel', categories: ['flight', 'visa', 'hotel', 'other'] };
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
  assert.equal(
    parsed.facts.some((f) => f.label === 'budget'),
    false,
  );
  assert.throws(
    () =>
      validateAnalysis(
        {
          ...valid,
          facts: [{ label: 'City', value: 'Dubai', quote: 'Dubai', messageId: 'sample-msg-1' }],
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
          facts: [
            { label: 'Greeting', value: 'Hi Ava', quote: 'Hi Ava', messageId: 'sample-msg-2' },
          ],
        },
        source,
      ),
    AnalysisError,
  );
  assert.throws(
    () => validateAnalysis({ ...valid, inquiryStatus: 'confirmedBooking' }, source),
    AnalysisError,
  );
  assert.throws(
    () => validateAnalysis({ ...valid, services: ['x'.repeat(61)] }, source),
    AnalysisError,
  );
});
test('OpenRouter uses Haiku and strict JSON; refuses incomplete, wrong-model and failed responses', async () => {
  const originalFetch = globalThis.fetch,
    originalKey = process.env.OPENROUTER_API_KEY,
    originalModel = process.env.OPENROUTER_MODEL;
  process.env.OPENROUTER_API_KEY = 'unit-test-only';
  process.env.OPENROUTER_MODEL = 'anthropic/claude-haiku-5.5';
  let stop = 'stop',
    status = 200,
    calls = 0,
    malformed = false,
    model = 'anthropic/claude-haiku-5.5',
    refusal: string | undefined;
  globalThis.fetch = async (input, init) => {
    calls++;
    assert.equal(input, 'https://openrouter.ai/api/v1/chat/completions');
    const payload = JSON.parse(String(init?.body));
    assert.equal(payload.model, 'anthropic/claude-haiku-5.5');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer unit-test-only');
    assert.equal(payload.response_format.type, 'json_schema');
    assert.equal(payload.response_format.json_schema.strict, true);
    assert.equal(payload.response_format.json_schema.schema.additionalProperties, false);
    assert.deepEqual(payload.provider, { require_parameters: true, data_collection: 'deny' });
    assert.deepEqual(payload.reasoning, { enabled: false });
    assert.equal(payload.tools, undefined);
    assert.deepEqual(JSON.parse(payload.messages[1].content).business, business);
    assert.equal(
      payload.response_format.json_schema.schema.properties.services.items.enum,
      undefined,
    );
    assert.equal(
      payload.response_format.json_schema.schema.properties.services.items.type,
      'string',
    );
    assert.ok(payload.messages[0].content.includes('Sorani Kurdish'));
    return Response.json(
      {
        model,
        choices: [
          {
            finish_reason: stop,
            message: { content: malformed ? 'not JSON' : JSON.stringify(valid), refusal },
          },
        ],
        usage: { prompt_tokens: 150, completion_tokens: 90 },
      },
      { status },
    );
  };
  try {
    assert.equal((await analyzeWithHaiku(source, 'ckb', business)).inputTokens, 150);
    stop = 'length';
    await assert.rejects(analyzeWithHaiku(source, 'ckb', business), { code: 'analysisInvalid' });
    stop = 'content_filter';
    await assert.rejects(analyzeWithHaiku(source, 'ckb', business), { code: 'analysisInvalid' });
    stop = 'stop';
    malformed = true;
    await assert.rejects(analyzeWithHaiku(source, 'ckb', business), { code: 'analysisInvalid' });
    malformed = false;
    model = 'other-model';
    await assert.rejects(analyzeWithHaiku(source, 'ckb', business), { code: 'analysisInvalid' });
    model = 'anthropic/claude-haiku-5.5';
    refusal = 'Cannot comply';
    await assert.rejects(analyzeWithHaiku(source, 'ckb', business), { code: 'analysisInvalid' });
    refusal = undefined;
    status = 402;
    await assert.rejects(analyzeWithHaiku(source, 'ckb', business), {
      code: 'analysisNotConfigured',
    });
    status = 429;
    await assert.rejects(analyzeWithHaiku(source, 'ckb', business), {
      code: 'analysisRateLimited',
    });
    status = 503;
    await assert.rejects(analyzeWithHaiku(source, 'ckb', business), {
      code: 'analysisUnavailable',
    });
    assert.equal(calls, 9);
    process.env.OPENROUTER_MODEL = 'different-model';
    await assert.rejects(analyzeWithHaiku(source, 'ckb', business), {
      code: 'analysisNotConfigured',
    });
    assert.equal(calls, 9);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.OPENROUTER_MODEL;
    else process.env.OPENROUTER_MODEL = originalModel;
  }
});

test('AI categories and fact labels are open-ended across business types', () => {
  const messages = demoMessages['sample-dilan'].map((m) => ({ ...m, body: m.body! }));
  const { copyKey: _key, ...example } = sampleAnalyses['sample-dilan'];
  void _key;
  const result = {
    ...example,
    summary: 'A sofa inquiry.',
    nextStep: 'Share sofa options.',
    reviewNote: null,
  };
  assert.deepEqual(validateAnalysis(result, messages).services, ['furniture', 'delivery']);
  assert.deepEqual(validateAnalysis({ ...result, services: ['پێڵاو'] }, messages).services, [
    'پێڵاو',
  ]);
});

test('a real quote cannot be used to smuggle an invented fact value', () => {
  assert.throws(
    () =>
      validateAnalysis(
        {
          ...valid,
          subject: { value: 'Dubai', quote: 'two return tickets', messageId: 'sample-msg-1' },
        },
        source,
      ),
    AnalysisError,
  );
});
