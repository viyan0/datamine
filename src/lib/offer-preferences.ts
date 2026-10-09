export function normalizeOfferTopic(value: string) {
  return value.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/gu, ' ');
}

export function offerCommand(text: string) {
  const value = normalizeOfferTopic(text)
    .replace(/[.!؟?]+$/u, '')
    .trim();
  if (/^(stop offers?|إيقاف العروض|ايقاف العروض|أوقف العرض|اوقف العرض|وەستانی ئۆفەر)$/u.test(value))
    return 'stop';
  if (/^(more|more offers?|show me more|المزيد|المزيد من العروض|زیاتر|ئۆفەری زیاتر)$/u.test(value))
    return 'more';
  return null;
}

export function moreRequestFollowsOffer(
  request: { providerTimestamp: Date; createdAt: Date },
  offeredAt: Date | null | undefined,
) {
  if (!offeredAt) return false;
  // WhatsApp timestamps have second precision. Receipt order distinguishes a reply
  // received after the offer from a MORE already waiting before the offer was sent.
  return (
    request.createdAt.getTime() > offeredAt.getTime() &&
    request.providerTimestamp.getTime() >= Math.floor(offeredAt.getTime() / 1000) * 1000
  );
}
