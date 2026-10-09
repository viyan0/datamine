import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { products, memberships, campaigns } from '@/db/schema';
import { agencyAccessForUser, HttpError } from './access';
import type { ProductView } from './product-types';
import { productOfferText } from './product-types';
import { wakeWaitingRecommendations } from './recommendations';

export type { ProductView } from './product-types';
export { productOfferText } from './product-types';
type CurrentUser = { id: string; platformRole?: string };
type Transaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];
type Executor = ReturnType<typeof getDb> | Transaction;
const price = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/)
  .transform((value) => {
    const [whole, fraction = ''] = value.split('.');
    return `${whole}.${fraction.padEnd(2, '0')}`;
  });
const fields = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1500),
  price,
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/),
  locale: z.enum(['en', 'ar', 'ckb']),
  expiresAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
  active: z.boolean(),
});
export const createProductSchema = fields
  .extend({
    agencyId: z.string().min(1),
    description: fields.shape.description.default(''),
    currency: fields.shape.currency.default('IQD'),
    locale: fields.shape.locale.default('en'),
    expiresAt: fields.shape.expiresAt.default(() => new Date(Date.now() + 7 * 86400000)),
    active: fields.shape.active.default(true),
  })
  .strict();
export const updateProductSchema = fields
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0);
function serialize(product: typeof products.$inferSelect): ProductView {
  return {
    ...product,
    locale: product.locale as ProductView['locale'],
    expiresAt: product.expiresAt.toISOString(),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

function validateAvailability(product: { active: boolean; expiresAt: Date }) {
  if (
    product.active &&
    (product.expiresAt <= new Date() || product.expiresAt.getTime() > Date.now() + 90 * 86400000)
  )
    throw new HttpError(422, 'offerExpired');
}

async function saveCatalogCampaign(
  tx: Transaction,
  product: typeof products.$inferSelect,
  createdBy: string,
) {
  const offer = {
    title: product.name,
    offerText: productOfferText(product, product.locale),
    locale: product.locale,
    networkEnabled: product.active,
    networkExpiresAt: product.active ? product.expiresAt : null,
    status: 'ready',
    dueAt: null,
    analysis: null,
    runId: null,
    error: null,
  };
  await tx
    .insert(campaigns)
    .values({
      id: randomUUID(),
      agencyId: product.agencyId,
      createdBy,
      productId: product.id,
      catalogOnly: true,
      ...offer,
    })
    .onConflictDoUpdate({
      target: campaigns.productId,
      targetWhere: sql`${campaigns.catalogOnly} = true`,
      set: offer,
    });
}

export async function listProducts(current: CurrentUser): Promise<ProductView[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(products)
    .where(
      current.platformRole === 'admin'
        ? undefined
        : inArray(
            products.agencyId,
            db
              .select({ id: memberships.agencyId })
              .from(memberships)
              .where(eq(memberships.userId, current.id)),
          ),
    )
    .orderBy(desc(products.active), desc(products.updatedAt));
  return rows.map(serialize);
}

export async function createProduct(current: CurrentUser, input: unknown) {
  const fields = createProductSchema.parse(input);
  await agencyAccessForUser(current, fields.agencyId, true);
  validateAvailability(fields);
  const saved = await getDb().transaction(async (tx) => {
    const [product] = await tx
      .insert(products)
      .values({ ...fields, id: randomUUID() })
      .returning();
    await saveCatalogCampaign(tx, product, current.id);
    return serialize(product);
  });
  await wakeWaitingRecommendations();
  return saved;
}

export async function updateProduct(current: CurrentUser, id: string, input: unknown) {
  const fields = updateProductSchema.parse(input);
  const db = getDb();
  const [existing] = await db
    .select({ agencyId: products.agencyId })
    .from(products)
    .where(eq(products.id, id));
  if (!existing) throw new HttpError(404, 'notFound');
  await agencyAccessForUser(current, existing.agencyId, true);
  const saved = await db.transaction(async (tx) => {
    const [product] = await tx
      .update(products)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();
    if (!product) throw new HttpError(404, 'notFound');
    validateAvailability(product);
    if (!product.active)
      await tx
        .update(campaigns)
        .set({ networkEnabled: false, networkExpiresAt: null })
        .where(eq(campaigns.productId, id));
    await saveCatalogCampaign(tx, product, current.id);
    return serialize(product);
  });
  await wakeWaitingRecommendations();
  return saved;
}

export async function getActiveProduct(
  agencyId: string,
  productId: string,
  executor: Executor = getDb(),
) {
  const [product] = await executor
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.agencyId, agencyId)))
    .for('update');
  if (!product) throw new HttpError(404, 'notFound');
  if (!product.active) throw new HttpError(409, 'productArchived');
  if (product.expiresAt <= new Date()) throw new HttpError(409, 'offerExpired');
  return product;
}

export async function isProductActive(
  productId: string | null | undefined,
  executor: Executor = getDb(),
) {
  if (!productId) return true;
  const [product] = await executor
    .select({ active: products.active, expiresAt: products.expiresAt })
    .from(products)
    .where(eq(products.id, productId));
  return product?.active === true && product.expiresAt > new Date();
}
