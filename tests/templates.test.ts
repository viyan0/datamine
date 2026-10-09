import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  marketingTemplates,
  createMarketingTemplate,
  templateName,
  templateBodySchema,
} from '../src/lib/meta-templates';
import { approvedTemplates } from '../src/lib/meta';
import { draftOfferTemplate } from '../src/lib/template-draft';

const body = 'Flower offer from Example Shop. Reply for details. Reply STOP to stop offers.';
const input = { wabaId: '12345', token: 'test-only', campaignId: 'a-b-c', language: 'en', body };
const row = {
  id: '42',
  name: templateName(input.campaignId, 'en', body),
  language: 'en',
  category: 'MARKETING',
  status: 'PENDING',
  components: [{ type: 'BODY', text: body }],
};

test('template management shows review outcomes but sending accepts only approved simple marketing text', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      data: [
        row,
        { ...row, id: 'approved', status: 'APPROVED' },
        { ...row, id: 'rejected', status: 'REJECTED', rejected_reason: 'INVALID_FORMAT' },
        { ...row, id: 'utility', category: 'UTILITY', status: 'APPROVED' },
        {
          ...row,
          id: 'media',
          status: 'APPROVED',
          components: [...row.components, { type: 'HEADER', format: 'IMAGE' }],
        },
        {
          ...row,
          id: 'variable',
          status: 'APPROVED',
          components: [{ type: 'BODY', text: 'Hello {{1}}' }],
        },
      ],
    });
  try {
    assert.deepEqual(
      (await marketingTemplates('12345', 'test-only')).map((t) => t.status),
      ['PENDING', 'APPROVED', 'REJECTED'],
    );
    assert.equal(
      (await marketingTemplates('12345', 'test-only'))[2].rejectionReason,
      'INVALID_FORMAT',
    );
    assert.deepEqual(
      (await approvedTemplates('12345', 'test-only')).map((t) => t.id),
      ['approved'],
    );
  } finally {
    globalThis.fetch = original;
  }
});
test('template submission is idempotent and recovers a lost provider response without another POST', async () => {
  const original = globalThis.fetch;
  let saved = false,
    posts = 0;
  globalThis.fetch = async (url, init) => {
    assert.ok(String(url).startsWith('https://graph.facebook.com/'));
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-only');
    if (init?.method === 'POST') {
      posts++;
      saved = true;
      assert.deepEqual(JSON.parse(String(init.body)), {
        name: row.name,
        language: 'en',
        category: 'MARKETING',
        components: row.components,
      });
      throw new Error('Response lost after creation');
    }
    assert.equal(new URL(String(url)).searchParams.get('name'), row.name);
    return Response.json({ data: saved ? [row] : [] });
  };
  try {
    assert.equal((await createMarketingTemplate(input)).status, 'PENDING');
    assert.equal((await createMarketingTemplate(input)).id, '42');
    assert.equal(posts, 1);
    assert.notEqual(
      templateName('a-b-c', 'en', body),
      templateName('a-b-c', 'en', body + ' Changed.'),
    );
    assert.throws(() => templateBodySchema.parse('Hello {{customer}}, this is an offer.'));
    assert.throws(() => templateBodySchema.parse('x'.repeat(1025)));
  } finally {
    globalThis.fetch = original;
  }
});
test('template failures expose an actionable code and only the provider’s user-facing explanation', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) =>
    init?.method === 'POST'
      ? Response.json(
          {
            error: {
              message: 'raw internal request',
              error_user_msg: 'Unsupported language',
              code: 100,
            },
          },
          { status: 400 },
        )
      : Response.json({ data: [] });
  try {
    await assert.rejects(createMarketingTemplate(input), {
      code: 'templateSubmitFailed',
      detail: 'Unsupported language',
    });
    globalThis.fetch = async () =>
      Response.json({ error: { code: 190, message: 'private token expired' } }, { status: 401 });
    await assert.rejects(marketingTemplates('12345', 'test-only'), {
      code: 'metaTokenExpired',
      detail: undefined,
    });
  } finally {
    globalThis.fetch = original;
  }
});
test('AI drafts only from the business offer, in its language, without sending to Meta', async () => {
  const original = globalThis.fetch,
    oldKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'test-only';
  const offer = {
    title: 'Flowers',
    offerText: 'Flowers offer',
    locale: 'ar',
    businessName: 'Example Shop',
  };
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    const request = JSON.parse(String(init?.body));
    assert.equal(request.model, 'anthropic/claude-haiku-5.5');
    assert.deepEqual(JSON.parse(request.messages[1].content), offer);
    assert.match(request.messages[0].content, /Never invent prices/);
    assert.match(request.messages[0].content, /Arabic/);
    return Response.json({
      model: request.model,
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ body }) } }],
    });
  };
  try {
    assert.deepEqual(await draftOfferTemplate(offer), { body });
  } finally {
    globalThis.fetch = original;
    if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = oldKey;
  }
});
