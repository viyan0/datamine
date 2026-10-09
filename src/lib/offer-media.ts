import { z } from 'zod';

export const offerPhoneSchema = z
  .string()
  .trim()
  .max(30)
  .transform((value) => value.replace(/[\s()+-]/g, ''))
  .refine((value) => !value || /^[1-9]\d{7,14}$/.test(value), 'Include a country code');
export const offerImageSchema = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return (
        url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        !url.port &&
        /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname) &&
        !/(^|\.)(localhost|local|internal|test|invalid)$/i.test(url.hostname)
      );
    } catch {
      return false;
    }
  }, 'Use a public HTTPS image URL');

export function sellerContact(phone: string, locale = 'en') {
  if (!phone) return '';
  const label =
    { en: 'Business contact', ar: 'رقم الشركة', ckb: 'ژمارەی کاروبار' }[locale] ||
    'Business contact';
  return `${label}: +${phone}\nhttps://wa.me/${phone}`;
}

export function offerDelivery(body: string, imageUrl?: string | null) {
  if (imageUrl && body.length <= 1024) return { type: 'image', body, imageUrl };
  return { type: 'text', body: imageUrl ? `${body}\n\n${imageUrl}` : body, imageUrl: null };
}
