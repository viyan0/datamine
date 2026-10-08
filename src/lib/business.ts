import { z } from 'zod';
export const defaultCategories: string[] = [];
export const categorySchema = z.string().trim().min(1).max(60);
export const businessSettingsSchema = z.object({
  industry: z.string().trim().min(1).max(100).default('General business'),
  categories: z
    .array(categorySchema)
    .max(12)
    .transform((v) => [...new Set(v)])
    .default(defaultCategories),
});
export type BusinessContext = z.infer<typeof businessSettingsSchema>;
