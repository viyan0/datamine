'use client';
import { useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { WorkspaceData } from '@/lib/workspace';
import type { CampaignView } from '@/lib/campaign-types';
import { productOfferText, type ProductView } from '@/lib/product-types';
import { Button } from './ui/button';
import { Dialog } from './dialog';

function offerDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}
export function publicationInput(form: FormData) {
  const enabled = form.get('networkEnabled') === 'on';
  const date = String(form.get('networkExpiresAt') || '');
  return {
    networkEnabled: enabled,
    networkExpiresAt: enabled && date ? new Date(`${date}T23:59:59`).toISOString() : null,
  };
}
export function NetworkFields({
  campaign,
  disabled,
}: {
  campaign?: CampaignView;
  disabled: boolean;
}) {
  const t = useTranslations('offers');
  const [enabled, setEnabled] = useState(campaign?.networkEnabled || false);
  const [openedAt] = useState(() => Date.now());
  return (
    <>
      <div className="consent-box">
        <label>
          <input
            type="checkbox"
            name="networkEnabled"
            checked={enabled}
            disabled={disabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          <span>{t('networkPublish')}</span>
        </label>
      </div>
      {enabled && (
        <label>
          {t('networkUntil')}
          <input
            type="date"
            name="networkExpiresAt"
            required
            disabled={disabled}
            min={offerDate(new Date(openedAt))}
            max={offerDate(new Date(openedAt + 89 * 86400000))}
            defaultValue={
              campaign?.networkExpiresAt
                ? offerDate(new Date(campaign.networkExpiresAt))
                : offerDate(new Date(openedAt + 7 * 86400000))
            }
          />
        </label>
      )}
    </>
  );
}

export function OfferCreateDialog({
  data,
  demo,
  product,
  close,
  onCreated,
}: {
  data: WorkspaceData;
  demo: boolean;
  product?: ProductView;
  close: () => void;
  onCreated: (campaign: CampaignView) => void;
}) {
  const t = useTranslations('offers'),
    p = useTranslations('catalog'),
    errors = useTranslations('errors');
  const locale = useLocale();
  const [language, setLanguage] = useState(
    product?.locale || data.agencies.find((a) => a.id === product?.agencyId)?.locale || locale,
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const businesses = data.agencies.filter(
    (a) => data.user.platformAdmin || ['owner', 'admin'].includes(a.role),
  );

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const input = {
      agencyId: product?.agencyId || String(form.get('agencyId') || ''),
      title: product?.name || String(form.get('title') || ''),
      offerText: product
        ? productOfferText(product, language)
        : String(form.get('offerText') || ''),
      locale: language,
      ...(product ? { productId: product.id } : {}),
      ...publicationInput(form),
    };
    try {
      let id = crypto.randomUUID();
      if (!demo) {
        const response = await fetch('/api/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'serverError');
        id = result.id;
      }
      onCreated({
        id,
        ...input,
        agencyName: data.agencies.find((a) => a.id === input.agencyId)?.name || '',
        status: demo ? 'demoDraft' : 'matching',
        createdAt: new Date().toISOString(),
        error: null,
        analysis: null,
        template: null,
        recipients: [],
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'serverError');
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={t('newOffer')}
      close={() => {
        if (!busy) close();
      }}
    >
      <form className="modal-body" onSubmit={create}>
        {product ? (
          <p className="form-hint">{p('offerHint')}</p>
        ) : (
          <p className="form-hint">{t('submitHint')}</p>
        )}
        <label>
          {t('business')}
          <select
            name="agencyId"
            defaultValue={product?.agencyId}
            disabled={!!product || busy}
            required
          >
            {businesses.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('title')}
          <input
            name="title"
            required
            minLength={2}
            maxLength={100}
            defaultValue={product?.name}
            readOnly={!!product}
            disabled={busy}
          />
        </label>
        <label>
          {t('language')}
          <select
            name="locale"
            value={language}
            disabled={busy}
            onChange={(event) => setLanguage(event.target.value)}
          >
            <option value="en">English</option>
            <option value="ar">العربية</option>
            <option value="ckb">کوردی</option>
          </select>
        </label>
        <label>
          {t('offerText')}
          {product ? (
            <textarea
              name="offerText"
              value={productOfferText(product, language)}
              readOnly
              rows={5}
              dir="auto"
            />
          ) : (
            <textarea
              name="offerText"
              required
              minLength={10}
              maxLength={3000}
              rows={5}
              disabled={busy}
            />
          )}
        </label>
        {!demo && !product && (
          <>
            <NetworkFields disabled={busy} />
            <p className="form-hint">{t('networkHint')}</p>
          </>
        )}
        {error && (
          <p role="alert" className="form-error">
            {errors.has(error) ? errors(error) : errors('serverError')}
          </p>
        )}
        <Button disabled={busy || businesses.length === 0}>{t('submit')}</Button>
      </form>
    </Dialog>
  );
}
