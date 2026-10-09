'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { MessageCircle } from 'lucide-react';
import type { WorkspaceData } from '@/lib/workspace';
import { Button } from './ui/button';

export function CentralWhatsapp({ data, demo }: { data: WorkspaceData; demo: boolean }) {
  const t = useTranslations('centralWhatsapp'),
    errors = useTranslations('errors'),
    router = useRouter();
  const [selected, setSelected] = useState(
    data.centralWhatsapp?.id || data.connections[0]?.id || '',
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const central = data.centralWhatsapp;
  async function save() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/campaigns/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected }),
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
        <MessageCircle />
      </span>
      <h2>{t('title')}</h2>
      <p>{t('description')}</p>
      {central ? (
        <p className="phone-display" dir="ltr">
          <a
            href={`https://wa.me/${central.displayPhone.replace(/\D/g, '')}`}
            target="_blank"
            rel="noreferrer"
          >
            {central.displayPhone}
          </a>
        </p>
      ) : (
        <p>{t('missing')}</p>
      )}
      {data.user.platformAdmin && !demo && data.connections.length > 0 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label htmlFor="central-whatsapp">{t('number')}</label>
          <select
            id="central-whatsapp"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={busy}
          >
            {data.connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} · {c.displayPhone}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={busy || !selected || selected === central?.id}>
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
