export function campaignReplyBody(campaign: {
  offerText: string;
  locale: string;
  template: { body: string } | null;
  businessName?: string;
}) {
  const content = campaign.template?.body || campaign.offerText;
  const sender =
    campaign.businessName?.toLocaleLowerCase() === 'datamine'
      ? 'Datamine'
      : `Datamine · ${campaign.businessName}`;
  const body = campaign.businessName ? `${sender}\n\n${content}` : content;
  if (/\bSTOP\b/i.test(body)) return body;
  const optOut =
    campaign.locale === 'ar'
      ? 'أرسل STOP لإيقاف الرسائل الترويجية.'
      : campaign.locale === 'ckb'
        ? 'بۆ وەستاندنی پەیامە بانگەشەییەکان STOP بنێرە.'
        : 'Reply STOP to stop promotional messages.';
  return `${body}\n\n${optOut}`;
}
