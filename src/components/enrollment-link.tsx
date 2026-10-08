'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Link2, Copy } from 'lucide-react';
import { Button } from './ui/button';
export function EnrollmentLink({ url, demo }: { url: string; demo: boolean }) {
  const t = useTranslations('enrollment'),
    errors = useTranslations('errors'),
    locale = useLocale();
  const [link, setLink] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(false);
  async function create() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${url}/enrollment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setLink(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'serverError');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="enrollment-link">
      <h3>
        <Link2 size={15} />
        {t('inviteTitle')}
      </h3>
      <p>{t('inviteHint')}</p>
      {demo ? (
        <Link className="text-link" href={`/${locale}/enroll/demo`}>
          {t('tryDemo')}
        </Link>
      ) : link ? (
        <>
          <input
            aria-label={t('link')}
            value={link}
            readOnly
            dir="ltr"
            onFocus={(e) => e.target.select()}
          />
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              } catch {
                setError('copyManually');
              }
            }}
          >
            <Copy size={14} />
            {t(copied ? 'copied' : 'copy')}
          </Button>
          <p>{t('linkHint')}</p>
        </>
      ) : (
        <Button variant="outline" disabled={busy} onClick={create}>
          {t(busy ? 'loading' : 'createLink')}
        </Button>
      )}
      {error && (
        <p className="form-error" role="alert">
          {errors.has(error) ? errors(error) : errors('serverError')}
        </p>
      )}
    </section>
  );
}
