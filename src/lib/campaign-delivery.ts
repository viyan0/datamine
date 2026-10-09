export function campaignReplyBody(campaign: {
  offerText: string;
  locale: string;
  template: { body: string } | null;
}) {
  const body = campaign.template?.body || campaign.offerText;
  if (/\bSTOP\b/i.test(body)) return body;
  const optOut =
    campaign.locale === 'ar'
      ? 'أرسل STOP لإيقاف الرسائل الترويجية.'
      : campaign.locale === 'ckb'
        ? 'بۆ وەستاندنی پەیامە بانگەشەییەکان STOP بنێرە.'
        : 'Reply STOP to stop promotional messages.';
  return `${body}\n\n${optOut}`;
}
