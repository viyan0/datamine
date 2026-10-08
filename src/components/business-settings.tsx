'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Building2 } from 'lucide-react';
import type { WorkspaceData } from '@/lib/workspace';
import { businessSettingsSchema } from '@/lib/business';
import { Button } from './ui/button';

export function BusinessSettings({ data, demo }: { data: WorkspaceData; demo: boolean }) {
  const t = useTranslations();
  const businesses = data.agencies.filter((a) => ['owner', 'admin'].includes(a.role));
  const [id, setId] = useState(businesses[0]?.id || '');
  const business = businesses.find((b) => b.id === id);
  if (!business) return null;
  return (
    <section className="panel settings-card">
      <span className="settings-icon">
        <Building2 />
      </span>
      <h2>{t('businessSettings')}</h2>
      <p>{t('businessSettingsHint')}</p>
      <label>
        {t('agency')}
        <select value={id} onChange={(e) => setId(e.target.value)}>
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <BusinessForm
        key={`${id}-${business.categories.join(',')}`}
        business={business}
        demo={demo}
      />
    </section>
  );
}
function BusinessForm({
  business,
  demo,
}: {
  business: WorkspaceData['agencies'][number];
  demo: boolean;
}) {
  const t = useTranslations(),
    router = useRouter();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    const form = new FormData(e.currentTarget);
    try {
      const parsed = businessSettingsSchema.safeParse({
        industry: form.get('industry'),
        categories: String(form.get('categories'))
          .split(/[,،]/)
          .map((s) => s.trim())
          .filter(Boolean),
      });
      if (!parsed.success) throw new Error('errors.invalidInput');
      if (demo) {
        setMessage('demoReadOnly');
        return;
      }
      const response = await fetch(`/api/agencies/${business.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(`errors.${result.error}`);
      setMessage('crm.saved');
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error && t.has(e.message) ? e.message : 'errors.serverError');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save}>
      <label>
        {t('businessType')}
        <input name="industry" defaultValue={business.industry} maxLength={100} required />
      </label>
      <label>
        {t('categoriesLabel')}
        <input name="categories" defaultValue={business.categories.join(', ')} maxLength={720} />
      </label>
      <p className="form-hint">{t('categoriesHint')}</p>
      <Button disabled={busy}>{t(busy ? 'loading' : 'save')}</Button>
      {message && (
        <p className="form-hint" role="status">
          {t(message)}
        </p>
      )}
    </form>
  );
}
