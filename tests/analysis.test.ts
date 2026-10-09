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

test('automatic topic-stop acknowledgements cannot break analysis or become global withdrawal', () => {
  const acknowledgement: SourceMessage = {
    id: 'bot-stop',
    direction: 'outbound',
    body: 'Offers about bicycles are stopped.',
    timestamp: new Date().toISOString(),
  };
  const stop = { value: 'bicycles', quote: acknowledgement.body, messageId: acknowledgement.id };
  assert.equal(
    validateAnalysis({ ...valid, stopOffers: stop }, [...source, acknowledgement]).stopOffers,
    null,
  );
  const topicCommand: SourceMessage = {
    ...acknowledgement,
    id: 'customer-stop',
    direction: 'inbound',
    body: 'STOP OFFER',
  };
  assert.equal(
    validateAnalysis(
      {
        ...valid,
        stopOffers: { value: 'STOP OFFER', quote: 'STOP OFFER', messageId: topicCommand.id },
      },
      [...source, topicCommand],
    ).stopOffers,
    null,
  );
  assert.throws(
    () => validateAnalysis({ ...valid, subject: stop }, [...source, acknowledgement]),
    AnalysisError,
  );
});

test('one evidence repair uses original messages and still rejects an unsupported repaired fact', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'isolated-test-only';
  const invalid = {
    ...valid,
    subject: { value: 'Dubai', quote: 'two return tickets', messageId: 'sample-msg-1' },
  };
  let calls = 0,
    failRepair = false;
  globalThis.fetch = async (_url, init) => {
    calls++;
    const input = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
    assert.deepEqual(input.messages, source);
    if (calls % 2 === 0) assert.deepEqual(input.rejectedAnalysis, invalid);
    return Response.json({
      model: 'anthropic/claude-haiku-5.5',
      choices: [
        {
          finish_reason: 'stop',
          message: { content: JSON.stringify(calls % 2 === 1 || failRepair ? invalid : valid) },
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    });
  };
  try {
    const result = await analyzeWithHaiku(source, 'en', business);
    assert.equal(result.inputTokens, 200);
    assert.equal(result.outputTokens, 100);
    assert.equal(calls, 2);
    failRepair = true;
    await assert.rejects(analyzeWithHaiku(source, 'en', business), { code: 'analysisInvalid' });
    assert.equal(calls, 4);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  }
});

test('capitalized AI values keep the exact source spelling without accepting invented evidence', () => {
  const messages: SourceMessage[] = [
    {
      id: 'customer-laptop',
      direction: 'inbound',
      body: 'I want price of the laptop (16+ GB).',
      timestamp: '2026-10-08T16:58:00Z',
    },
  ];
  const quote = messages[0].body;
  const value = {
    ...valid,
    services: ['Laptop pricing'],
    subject: { value: 'Laptop', quote, messageId: messages[0].id },
    facts: [
      { label: 'Request', value: 'Price of the laptop (16+ GB)', quote, messageId: messages[0].id },
    ],
    stopOffers: null,
  };
  const result = validateAnalysis(value, messages);
  assert.equal(result.subject?.value, 'laptop');
  assert.equal(result.facts[0].value, 'price of the laptop (16+ GB)');
  assert.throws(
    () =>
      validateAnalysis({ ...value, subject: { ...value.subject, value: 'Laptop.*' } }, messages),
    AnalysisError,
  );
  assert.throws(
    () => validateAnalysis({ ...value, subject: { ...value.subject, value: 'MacBook' } }, messages),
    AnalysisError,
  );
  assert.throws(
    () =>
      validateAnalysis(
        { ...value, subject: { ...value.subject, quote: quote.replace('laptop', 'Laptop') } },
        messages,
      ),
    AnalysisError,
  );
  assert.throws(
    () => validateAnalysis(value, [{ ...messages[0], direction: 'outbound' }]),
    AnalysisError,
  );
});
