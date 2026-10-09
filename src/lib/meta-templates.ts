import { createHash } from 'node:crypto';
import { z } from 'zod';
import { HttpError } from './access';
import type { ManagedTemplate } from './template-types';

export const templateBodySchema = z
  .string()
  .trim()
  .min(10)
  .max(1024)
  .refine((s) => !s.includes('{{') && !s.includes('}}'), 'Use complete text without variables');

export class TemplateError extends HttpError {
  constructor(
    code: string,
    public detail?: string,
  ) {
    super(502, code);
  }
}
function endpoint(wabaId: string) {
  const version = process.env.META_GRAPH_VERSION || 'v23.0';
  if (!/^v\d+\.0$/.test(version) || !/^\d+$/.test(wabaId))
    throw new HttpError(422, 'templateUnavailable');
  return `https://graph.facebook.com/${version}/${wabaId}/message_templates`;
}
async function providerError(response: Response, fallback: string) {
  const data = await response.json().catch(() => ({}));
  if (data.error?.code === 190) return new TemplateError('metaTokenExpired');
  if ([10, 200].includes(data.error?.code)) return new TemplateError('metaTemplatePermission');
  // Only Meta's intended user-facing explanation is shown, never its raw request/error dump.
  return new TemplateError(
    fallback,
    typeof data.error?.error_user_msg === 'string'
      ? data.error.error_user_msg.slice(0, 500)
      : undefined,
  );
}
export async function marketingTemplates(
  wabaId: string,
  token: string,
  name?: string,
): Promise<ManagedTemplate[]> {
  const url = new URL(endpoint(wabaId));
  url.search = new URLSearchParams({
    fields: 'id,name,status,category,language,components,rejected_reason',
    limit: '100',
    ...(name ? { name } : {}),
  }).toString();
  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw await providerError(response, 'templateUnavailable');
  const data = (await response.json()) as {
    data?: {
      id: string;
      name: string;
      language: string;
      status: string;
      category: string;
      rejected_reason?: string;
      components?: { type: string; text?: string }[];
    }[];
  };
  return (data.data || [])
    .filter(
      (t) =>
        t.category === 'MARKETING' &&
        t.components?.some((c) => c.type === 'BODY' && c.text) &&
        t.components.every(
          (c) =>
            ['BODY', 'FOOTER'].includes(c.type) &&
            typeof c.text === 'string' &&
            !c.text.includes('{{'),
        ),
    )
    .map((t) => ({
      id: t.id,
      name: t.name,
      language: t.language,
      status: t.status,
      body: t.components!.map((c) => c.text).join('\n\n'),
      ...(t.rejected_reason && t.rejected_reason !== 'NONE'
        ? { rejectionReason: t.rejected_reason }
        : {}),
    }));
}
export function templateName(campaignId: string, language: string, body: string) {
  return `datamine_${campaignId.replace(/[^a-z0-9]/g, '')}_${createHash('sha256')
    .update(JSON.stringify([language, body]))
    .digest('hex')
    .slice(0, 16)}`;
}
export async function createMarketingTemplate(input: {
  wabaId: string;
  token: string;
  campaignId: string;
  language: string;
  body: string;
}): Promise<ManagedTemplate> {
  const body = templateBodySchema.parse(input.body);
  const name = templateName(input.campaignId, input.language, body);
  const existing = async () =>
    (await marketingTemplates(input.wabaId, input.token, name)).find(
      (t) => t.name === name && t.language === input.language && t.body === body,
    );
  // A stable name also recovers a lost response or repeated click without creating duplicates.
  const found = await existing();
  if (found) return found;
  try {
    const response = await fetch(endpoint(input.wabaId), {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        language: input.language,
        category: 'MARKETING',
        components: [{ type: 'BODY', text: body }],
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw await providerError(response, 'templateSubmitFailed');
    const result = (await response.json()) as { id?: string; status?: string };
    if (!result.id || !result.status) throw new TemplateError('templateSubmissionUnknown');
    return { id: result.id, name, language: input.language, body, status: result.status };
  } catch (error) {
    const recovered = await existing().catch(() => undefined);
    if (recovered) return recovered;
    if (error instanceof TemplateError) throw error;
    throw new TemplateError('templateSubmissionUnknown');
  }
}
