'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Search, RefreshCw } from 'lucide-react';
import type { SharedProfile } from '@/lib/enrollment-types';
import { readDemoProfile, sampleProfiles } from '@/lib/demo-enrollment';
import { Button } from './ui/button';
export function CustomerDirectory({ demo }: { demo: boolean }) {
  const t = useTranslations('enrollment'),
    errors = useTranslations('errors'),
    locale = useLocale();
  const [profiles, setProfiles] = useState<SharedProfile[]>([]),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState('all');
  const [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const load = demo
      ? Promise.resolve().then(() => {
          const p = readDemoProfile();
          return { profiles: [...(p ? [p] : []), ...sampleProfiles] };
        })
      : fetch('/api/customers', { cache: 'no-store', signal: controller.signal }).then(
          async (r) => {
            const data = await r.json();
            if (!r.ok) throw new Error(data.error);
            return data;
          },
        );
    load
      .then((data) => {
        if (!controller.signal.aborted) {
          setProfiles(data.profiles);
          setError('');
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [demo, revision]);
  const visible = profiles.filter(
    (p) =>
      (filter === 'all' || p.status === filter) &&
      `${p.name} ${p.phone} ${p.destination} ${p.interests.join(' ')}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  return (
    <>
      <div className="toolbar customer-toolbar">
        <div className="inbox-filters" role="group" aria-label={t('filter')}>
          {['all', 'active', 'optedOut'].map((v) => (
            <button
              key={v}
              aria-pressed={filter === v}
              className={filter === v ? 'active' : ''}
              onClick={() => setFilter(v)}
            >
              {t(v)}
            </button>
          ))}
        </div>
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label={t('search')}
            placeholder={t('search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <Button
          variant="outline"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            setRevision((n) => n + 1);
          }}
        >
          <RefreshCw size={14} />
          {t('refresh')}
        </Button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {errors.has(error) ? errors(error) : errors('serverError')}
        </p>
      )}
      <section className="panel table-scroll">
        <table>
          <thead>
            <tr>
              {['name', 'phone', 'preferences', 'status', 'consentDate'].map((k) => (
                <th key={k}>{t(k)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.name}</strong>
                  <small className="directory-language">
                    {{ en: 'English', ar: 'العربية', ckb: 'کوردی' }[p.language]}
                  </small>
                </td>
                <td dir="ltr">{p.phone}</td>
                <td>
                  <span dir="auto">{p.interests.join(' · ') || t('noInterests')}</span>
                  <small className="directory-language" dir="auto">
                    {p.destination}
                  </small>
                </td>
                <td>
                  <span
                    className={`badge ${p.status === 'active' ? 'badge-green' : 'badge-neutral'}`}
                  >
                    {t(p.status)}
                  </span>
                </td>
                <td>
                  {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                    new Date(p.consentAt),
                  )}
                </td>
              </tr>
            ))}
            {!visible.length && (
              <tr>
                <td colSpan={5}>
                  <div className="empty-state">
                    <h3>{t(loading ? 'loading' : 'noProfiles')}</h3>
                    <p>{t('noProfilesHint')}</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      {demo && (
        <div className="notice">
          <p>{t('demoDirectory')}</p>
          <Link className="text-link" href={`/${locale}/enroll/demo`}>
            {t('tryDemo')}
          </Link>
        </div>
      )}
    </>
  );
}
