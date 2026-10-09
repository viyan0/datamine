import { HttpError } from './access';
import { marketingTemplates } from './meta-templates';
import type { ApprovedTemplate } from './template-types';
export type { ApprovedTemplate } from './template-types';
async function sendMetaMessage(input: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  messageId: string;
  content: Record<string, unknown>;
}): Promise<{ status: string; providerMessageId?: string }> {
  const version = process.env.META_GRAPH_VERSION || 'v23.0';
  if (!/^v\d+\.0$/.test(version) || !/^\d+$/.test(input.phoneNumberId)) return { status: 'failed' };
  try {
    const response = await fetch(
      `https://graph.facebook.com/${version}/${input.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: input.to,
          ...input.content,
          biz_opaque_callback_data: input.messageId,
        }),
        signal: AbortSignal.timeout(15000),
        cache: 'no-store',
      },
    );
    if (!response.ok)
      return { status: response.status >= 500 || response.status === 408 ? 'uncertain' : 'failed' };
    const result = (await response.json()) as { messages?: { id: string }[] };
    const providerMessageId = result.messages?.[0]?.id;
    return typeof providerMessageId === 'string' && providerMessageId.length
      ? { status: 'accepted', providerMessageId }
      : { status: 'uncertain' };
  } catch {
    // A lost response does not prove the message failed. Never retry automatically.
    return { status: 'uncertain' };
  }
}
export function sendMetaText(input: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  body: string;
  messageId: string;
}) {
  return sendMetaMessage({
    ...input,
    content: { type: 'text', text: { preview_url: false, body: input.body } },
  });
}
export function sendMetaTemplate(input: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  messageId: string;
  template: ApprovedTemplate;
}) {
  return sendMetaMessage({
    ...input,
    content: {
      type: 'template',
      template: { name: input.template.name, language: { code: input.template.language } },
    },
  });
}
export async function approvedTemplates(
  wabaId: string,
  accessToken: string,
): Promise<ApprovedTemplate[]> {
  return (await marketingTemplates(wabaId, accessToken))
    .filter((t) => t.status === 'APPROVED')
    .map(({ id, name, language, body }) => ({ id, name, language, body }));
}
export async function verifyMetaNumber(input: {
  phoneNumberId: string;
  wabaId: string;
  accessToken: string;
}) {
  const version = process.env.META_GRAPH_VERSION || 'v23.0';
  if (!/^v\d+\.0$/.test(version)) throw new Error('Invalid Meta API version');
  // Fixed provider host and numeric identifiers prevent user-controlled outbound URLs.
  const response = await fetch(
    `https://graph.facebook.com/${version}/${input.wabaId}/phone_numbers?fields=id,display_phone_number,verified_name&limit=100`,
    {
      headers: { Authorization: `Bearer ${input.accessToken}` },
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    },
  );
  if (!response.ok) throw new HttpError(422, 'metaVerificationFailed');
  const data = (await response.json()) as { data?: { id: string; display_phone_number: string }[] };
  const phone = data.data?.find((p) => p.id === input.phoneNumberId);
  if (!phone) throw new HttpError(422, 'metaVerificationFailed');
  return phone;
}
