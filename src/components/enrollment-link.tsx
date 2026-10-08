'use client';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { ShieldCheck } from 'lucide-react';
export function EnrollmentLink({
  demo,
  status,
  replyStatus,
}: {
  demo: boolean;
  status?: string | null;
  replyStatus?: string | null;
}) {
  const t = useTranslations('enrollment'),
    locale = useLocale();
  const failed = ['failed', 'uncertain'].includes(replyStatus || '');
  return (
    <section className="enrollment-link" aria-live="polite">
      <h3>
        <ShieldCheck size={15} />
        {t('singleConsent')}
      </h3>
      <p>
        {t(
          status === 'accepted'
            ? 'consentAccepted'
            : status === 'declined'
              ? 'consentDeclined'
              : failed
                ? 'consentFailed'
                : 'consentPending',
        )}
      </p>
      {demo && (
        <Link className="text-link" href={`/${locale}/enroll/demo`}>
          {t('tryDemo')}
        </Link>
      )}
    </section>
  );
}
