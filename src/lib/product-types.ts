export type ProductView = {
  id: string;
  agencyId: string;
  name: string;
  description: string;
  price: string;
  currency: string;
  locale: 'en' | 'ar' | 'ckb';
  expiresAt: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export function productOfferText(
  product: Pick<ProductView, 'name' | 'description' | 'price' | 'currency'>,
  locale = 'en',
) {
  const label = { en: 'Price', ar: 'السعر', ckb: 'نرخ' }[locale] || 'Price';
  return [product.name, product.description, `${label}: ${product.price} ${product.currency}`]
    .filter(Boolean)
    .join('\n\n');
}
