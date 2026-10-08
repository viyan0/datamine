'use client';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { Globe2 } from 'lucide-react';
export function LanguageSwitch() {
  const locale = useLocale(),
    pathname = usePathname(),
    router = useRouter(),
    t = useTranslations();
  return (
    <label className="language-switch">
      <Globe2 size={15} />
      <span className="sr-only">{t('interfaceLanguage')}</span>
      <select
        aria-label={t('interfaceLanguage')}
        value={locale}
        onChange={(e) =>
          router.push(
            pathname.replace(/^\/(en|ar|ckb)(?=\/|$)/, `/${e.target.value}`) + window.location.hash,
          )
        }
      >
        <option value="en">English</option>
        <option value="ar">العربية</option>
        <option value="ckb">کوردی</option>
      </select>
    </label>
  );
}
