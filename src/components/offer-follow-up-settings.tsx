'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Clock } from 'lucide-react';
import type { WorkspaceData } from '@/lib/workspace';
import {
  businessChatOfferModes,
  followUpDelayHours,
  type BusinessChatOfferMode,
} from '@/lib/offer-follow-up-types';
import { Button } from './ui/button';

export function OfferFollowUpSettings({ data, demo }: { data: WorkspaceData; demo: boolean }) {
  const t = useTranslations('offerFollowUps'),
    errors = useTranslations('errors'),
    router = useRouter();
  const current = data.businessChatOffers || 'immediate';
  const [selected, setSelected] = useState<BusinessChatOfferMode>(current);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function save() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/platform-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessChatOffers: selected }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'serverError');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel settings-card">
      <span className="settings-icon">
        <Clock />
      </span>
      <h2>{t('title')}</h2>
      <p>{t('description', { hours: followUpDelayHours })}</p>
      {demo ? (
        <p>
          <span className="badge badge-neutral">{t(current)}</span>
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label htmlFor="business-chat-offers">{t('mode')}</label>
          <select
            id="business-chat-offers"
            value={selected}
            onChange={(e) => setSelected(e.target.value as BusinessChatOfferMode)}
            disabled={busy}
          >
            {businessChatOfferModes.map((mode) => (
              <option key={mode} value={mode}>
                {t(mode)}
              </option>
            ))}
          </select>
          <p className="form-hint">{t(`${selected}Help`, { hours: followUpDelayHours })}</p>
          <Button type="submit" disabled={busy || selected === current}>
            {busy ? t('saving') : t('save')}
          </Button>
          {error && (
            <p role="alert" className="form-error">
              {errors.has(error) ? errors(error) : errors('serverError')}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
