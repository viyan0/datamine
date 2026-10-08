import { HttpError } from './access';
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
