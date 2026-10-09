'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Archive, Megaphone, Tags, Pencil, Plus, RotateCcw, Search } from 'lucide-react';
import type { WorkspaceData } from '@/lib/workspace';
import type { ProductView } from '@/lib/product-types';
import { Button } from './ui/button';
import { Dialog } from './dialog';
import { OfferCreateDialog } from './offer-create-dialog';

function localDateTime(value: string | number) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function request(path: string, method = 'GET', input?: unknown) {
  const response = await fetch(path, {
    method,
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    ...(input ? { body: JSON.stringify(input) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'serverError');
  return result;
}

export function Products({ data, demo }: { data: WorkspaceData; demo: boolean }) {
  const t = useTranslations('catalog'),
    errors = useTranslations('errors');
  const locale = useLocale(),
    router = useRouter();
  const [products, setProducts] = useState<ProductView[]>([]);
  const [loading, setLoading] = useState(!demo),
    [error, setError] = useState('');
  const [editing, setEditing] = useState<ProductView | 'new' | null>(null);
  const [offer, setOffer] = useState<ProductView | null>(null);
  const [viewedAt, setViewedAt] = useState(() => Date.now());
  const [formOpenedAt, setFormOpenedAt] = useState(() => Date.now());
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const [query, setQuery] = useState(''),
    [agency, setAgency] = useState(''),
    [archived, setArchived] = useState(false);
  const businesses = data.agencies.filter(
    (item) => data.user.platformAdmin || ['owner', 'admin'].includes(item.role),
  );
  const canManage = (agencyId: string) => businesses.some((item) => item.id === agencyId);
  const visible = products.filter(
    (product) =>
      (archived || product.active) &&
      (!agency || product.agencyId === agency) &&
      `${product.name} ${product.description}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );

  useEffect(() => {
    const timer = setInterval(() => setViewedAt(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (demo) return;
    let current = true;
    request('/api/products')
      .then((result) => {
        if (current) setProducts(result.products);
      })
      .catch((caught) => {
        if (current) setError(caught instanceof Error ? caught.message : 'serverError');
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [demo]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !editing) return;
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const existing = editing === 'new' ? null : editing;
    const input = {
      ...(existing ? {} : { agencyId: String(form.get('agencyId') || '') }),
      name: String(form.get('name') || '').trim(),
      description: String(form.get('description') || '').trim(),
      contactPhone: String(form.get('contactPhone') || '').replace(/[\s()+-]/g, ''),
      imageUrl: String(form.get('imageUrl') || '').trim(),
      price: String(form.get('price') || ''),
      currency: String(form.get('currency') || '')
        .trim()
        .toUpperCase(),
      locale: String(form.get('locale') || 'en') as ProductView['locale'],
      expiresAt: new Date(String(form.get('expiresAt'))).toISOString(),
      active: existing?.active ?? true,
    };
    try {
      if (demo) {
        const saved: ProductView = {
          id: existing?.id || crypto.randomUUID(),
          agencyId: existing?.agencyId || input.agencyId!,
          ...input,
          price: Number(input.price).toFixed(2),
          createdAt: existing?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setProducts((all) => [saved, ...all.filter((item) => item.id !== saved.id)]);
      } else {
        const result = await request(
          existing ? `/api/products/${existing.id}` : '/api/products',
          existing ? 'PATCH' : 'POST',
          input,
        );
        setProducts((all) => [
          result.product,
          ...all.filter((item) => item.id !== result.product.id),
        ]);
      }
      setEditing(null);
      setViewedAt(Date.now());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'serverError');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(product: ProductView) {
    if (busy) return;
    if (!product.active && new Date(product.expiresAt).getTime() <= Date.now()) {
      setError('');
      setFormOpenedAt(Date.now());
      setEditing({
        ...product,
        active: true,
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      });
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = demo
        ? { ...product, active: !product.active }
        : (await request(`/api/products/${product.id}`, 'PATCH', { active: !product.active }))
            .product;
      setProducts((all) => all.map((item) => (item.id === saved.id ? saved : item)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'serverError');
    } finally {
      setBusy(false);
    }
  }
  const draft = editing && editing !== 'new' ? editing : null;
  return (
    <>
      {demo && <p className="notice">{t('demoHint')}</p>}
      <div className="toolbar product-toolbar">
        <label className="search-field">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={t('search')}
            placeholder={t('search')}
          />
        </label>
        <div className="product-filters">
          {data.agencies.length > 1 && (
            <select
              aria-label={t('business')}
              value={agency}
              onChange={(event) => setAgency(event.target.value)}
            >
              <option value="">{t('allBusinesses')}</option>
              {data.agencies.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          )}
          {businesses.length > 0 && (
            <Button
              onClick={() => {
                setError('');
                setFormOpenedAt(Date.now());
                setEditing('new');
              }}
            >
              <Plus size={16} />
              {t('add')}
            </Button>
          )}
        </div>
      </div>
      <div className="product-count">
        <span>{t('count', { count: visible.length })}</span>
        <label>
          <input
            type="checkbox"
            checked={archived}
            onChange={(event) => setArchived(event.target.checked)}
          />
          {t('showArchived')}
        </label>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {errors.has(error) ? errors(error) : errors('serverError')}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {loading ? (
        <p className="form-hint" role="status">
          {t('loading')}
        </p>
      ) : visible.length ? (
        <div className="product-grid">
          {visible.map((product) => (
            <article className="panel product-card" key={product.id}>
              {product.imageUrl && (
                // External offer photos are displayed directly, without a server-side proxy.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="offer-photo"
                  src={product.imageUrl}
                  alt={product.name}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              )}
              <div className="product-card-heading">
                <span className="product-icon">
                  <Tags size={22} />
                </span>
                <span
                  className={`badge ${product.active && new Date(product.expiresAt).getTime() > viewedAt ? 'badge-green' : 'badge-neutral'}`}
                >
                  {t(
                    !product.active
                      ? 'archived'
                      : new Date(product.expiresAt).getTime() > viewedAt
                        ? 'available'
                        : 'expired',
                  )}
                </span>
              </div>
              <small>{data.agencies.find((item) => item.id === product.agencyId)?.name}</small>
              <h2 dir="auto">{product.name}</h2>
              {product.contactPhone && (
                <a
                  href={`https://wa.me/${product.contactPhone}`}
                  target="_blank"
                  rel="noreferrer"
                  dir="ltr"
                >
                  +{product.contactPhone}
                </a>
              )}
              <p className="product-description" dir="auto">
                {product.description}
              </p>
              <strong className="product-price" dir="auto">
                {new Intl.NumberFormat(locale, {
                  style: 'currency',
                  currency: product.currency,
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2,
                }).format(Number(product.price))}
              </strong>
              <small className="product-availability">
                {t('availableUntil', {
                  date: new Intl.DateTimeFormat(locale, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(product.expiresAt)),
                })}
              </small>
              {canManage(product.agencyId) && (
                <div className="product-actions">
                  {product.active && new Date(product.expiresAt).getTime() > viewedAt && (
                    <Button disabled={busy} onClick={() => setOffer(product)}>
                      <Megaphone size={15} />
                      {t('createOffer')}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setError('');
                      setFormOpenedAt(Date.now());
                      setEditing(product);
                    }}
                  >
                    <Pencil size={15} />
                    {t('edit')}
                  </Button>
                  <button
                    className="icon-button"
                    disabled={busy}
                    aria-label={t(product.active ? 'archiveNamed' : 'restoreNamed', {
                      name: product.name,
                    })}
                    title={t(product.active ? 'archive' : 'restore')}
                    onClick={() => void toggle(product)}
                  >
                    {product.active ? <Archive size={17} /> : <RotateCcw size={17} />}
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <section className="panel empty-state">
          <Tags size={30} />
          <h3>{t('empty')}</h3>
          <p>{t('emptyHint')}</p>
        </section>
      )}
      {editing && (
        <Dialog
          title={t(draft ? 'edit' : 'add')}
          close={() => {
            if (!busy) setEditing(null);
          }}
        >
          <form className="modal-body" onSubmit={save}>
            <p className="form-hint">
              {t(draft?.active === false ? 'archivedHint' : 'automaticHint')}
            </p>
            <label>
              {t('business')}
              <select
                name="agencyId"
                defaultValue={draft?.agencyId || agency || businesses[0]?.id}
                disabled={!!draft || busy}
                required
              >
                {businesses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('name')}
              <input
                name="name"
                required
                minLength={2}
                maxLength={100}
                defaultValue={draft?.name}
                disabled={busy}
              />
            </label>
            <label>
              {t('description')}
              <textarea
                name="description"
                maxLength={1500}
                rows={4}
                defaultValue={draft?.description}
                disabled={busy}
              />
            </label>
            <label>
              {t('contactPhone')}
              <input
                name="contactPhone"
                type="tel"
                required
                maxLength={30}
                defaultValue={draft?.contactPhone}
                disabled={busy}
                dir="ltr"
                placeholder="+964…"
              />
            </label>
            <label>
              {t('imageUrl')}
              <input
                name="imageUrl"
                type="url"
                maxLength={2000}
                defaultValue={draft?.imageUrl}
                disabled={busy}
                dir="ltr"
                placeholder="https://…"
              />
              <small className="form-hint">{t('imageHint')}</small>
            </label>
            <div className="form-grid">
              <label>
                {t('price')}
                <input
                  name="price"
                  type="number"
                  min="0"
                  max="9999999999.99"
                  step="0.01"
                  required
                  defaultValue={draft?.price}
                  disabled={busy}
                />
              </label>
              <label>
                {t('currency')}
                <input
                  name="currency"
                  pattern="[A-Za-z]{3}"
                  minLength={3}
                  maxLength={3}
                  required
                  defaultValue={draft?.currency || 'IQD'}
                  disabled={busy}
                  dir="ltr"
                />
              </label>
            </div>
            <div className="form-grid">
              <label>
                {t('language')}
                <select
                  name="locale"
                  defaultValue={
                    draft?.locale ||
                    data.agencies.find((item) => item.id === (agency || businesses[0]?.id))
                      ?.locale ||
                    locale
                  }
                  disabled={busy}
                >
                  <option value="en">English</option>
                  <option value="ar">العربية</option>
                  <option value="ckb">کوردی</option>
                </select>
              </label>
              <label>
                {t('until')}
                <input
                  name="expiresAt"
                  type="datetime-local"
                  required
                  disabled={busy}
                  min={
                    draft?.active === false
                      ? undefined
                      : localDateTime(Math.ceil(formOpenedAt / 60000) * 60000)
                  }
                  max={localDateTime(formOpenedAt + 89 * 86400000)}
                  defaultValue={localDateTime(draft?.expiresAt || formOpenedAt + 7 * 86400000)}
                />
              </label>
            </div>
            {error && (
              <p className="form-error" role="alert">
                {errors.has(error) ? errors(error) : errors('serverError')}
              </p>
            )}
            {draft && <p className="form-hint">{t('savedOfferPrice')}</p>}
            <Button disabled={busy}>{t('save')}</Button>
          </form>
        </Dialog>
      )}
      {offer && (
        <OfferCreateDialog
          data={data}
          demo={demo}
          product={offer}
          close={() => setOffer(null)}
          onCreated={() => {
            setOffer(null);
            if (demo) setNotice(t('demoCreated'));
            else router.push(`/${locale}/app/campaigns`);
          }}
        />
      )}
    </>
  );
}
