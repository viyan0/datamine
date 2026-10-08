import { z } from 'zod';
import { categorySchema } from './business';
export const consentVersion = '2026-10-08-whatsapp-v2';
export const profileFields = z.object({
  name: z.string().trim().min(1).max(120),
  language: z.enum(['en', 'ar', 'ckb']),
  destination: z.string().trim().max(160),
  interests: z
    .array(categorySchema)
    .max(12)
    .transform((v) => [...new Set(v)]),
});
export type ProfileFields = z.infer<typeof profileFields>;
export type SharedProfile = ProfileFields & {
  id: string;
  phone: string;
  status: string;
  consentAt: string;
  updatedAt: string;
};
export type CustomerAccess = { phone: string; profile: SharedProfile | null };
export function maskPhone(phone: string) {
  return `•••• ${phone.slice(-4)}`;
}
