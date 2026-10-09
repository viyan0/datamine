'use client';
import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog } from './dialog';
import type { CampaignView } from '@/lib/campaign-types';
import type { ManagedTemplate } from '@/lib/template-types';

export function OfferTemplate({
  campaign,
  templates,
  disabled,
  connected,
  onSelect,
  onCreated,
}: {
  campaign: CampaignView;
  templates: ManagedTemplate[];
  disabled: boolean;
  connected: boolean;
  onSelect: (id: string) => void;
  onCreated: () => Promise<void>;
}) {
  const t = useTranslations('offers'),
    errors = useTranslations('errors');
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [body, setBody] = useState(''),
    [error, setError] = useState(''),
    [detail, setDetail] = useState('');
  const selected = templates.find((p) => p.id === campaign.template?.id);
  const statusLabel = (status: string) =>
    t.has(`templateStatuses.${status}`) ? t(`templateStatuses.${status}`) : status;
  async function request(action: 'draft' | 'submit') {
    const response = await fetch(`/api/campaigns/${campaign.id}/template`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...(action === 'submit' ? { body } : {}) }),
    });
    const result = await response.json();
    if (!response.ok) {
      setDetail(result.detail || '');
      throw new Error(result.error || 'serverError');
    }
    return result;
  }
  async function draft() {
    setOpen(true);
    setBusy(true);
    setError('');
    setDetail('');
    setBody('');
    try {
      setBody((await request('draft')).body);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'serverError');
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setDetail('');
    try {
      await request('submit');
      await onCreated();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'serverError');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="offer-template">
      <label>
        {t('template')}
        <select
          value={campaign.template?.id || ''}
          disabled={disabled || busy}
          onChange={(e) => {
            if (e.target.value) onSelect(e.target.value);
          }}
        >
          <option value="">{t('chooseTemplate')}</option>
          {campaign.template && !selected && (
            <option value={campaign.template.id}>
              {campaign.template.name} · {t('templateChecking')}
            </option>
          )}
          {templates
            .filter(
              (p) => p.language === campaign.locale || p.language.startsWith(`${campaign.locale}_`),
            )
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {statusLabel(p.status)}
              </option>
            ))}
        </select>
        <small>{t('templateHint')}</small>
      </label>
      {selected && (
        <p className="form-hint" role="status">
          {t('templateStatus', { status: statusLabel(selected.status) })}
          {selected.status === 'PENDING' && <> · {t('templatePendingHint')}</>}
          {selected.rejectionReason && <> · {selected.rejectionReason}</>}
        </p>
      )}
      <Button
        variant="outline"
        disabled={disabled || busy || !connected}
        onClick={() => void draft()}
      >
        <Sparkles size={16} />
        {t('createTemplate')}
      </Button>
      {!connected && <p className="form-hint">{t('templateSenderHint')}</p>}
      {open && (
        <Dialog title={t('createTemplate')} close={() => setOpen(false)}>
          <form className="modal-body" onSubmit={submit}>
            <p className="form-hint">{t('templateDraftHint')}</p>
            <label>
              {t('templateMessage')}
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={6}
                required
                minLength={10}
                maxLength={1024}
                disabled={busy}
                dir="auto"
                aria-describedby="template-count"
              />
              <small id="template-count">{body.length}/1024</small>
            </label>
            {busy && <p role="status">{t(body ? 'templateSubmitting' : 'templateDrafting')}</p>}
            {error && (
              <p className="form-error" role="alert">
                {errors.has(error) ? errors(error) : errors('serverError')}
                {detail && <> {detail}</>}
              </p>
            )}
            <p className="form-hint">{t('templateReviewHint')}</p>
            <Button disabled={busy || body.trim().length < 10}>{t('submitTemplate')}</Button>
          </form>
        </Dialog>
      )}
    </div>
  );
}
