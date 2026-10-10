import type { Metadata } from 'next';
import { Host_Grotesk, Vazirmatn } from 'next/font/google';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import '../globals.css';
// Latin text uses Host Grotesk; Arabic and Sorani glyphs fall through to Vazirmatn.
const hostGrotesk = Host_Grotesk({ subsets: ['latin'], variable: '--font-latin', display: 'swap' });
const vazirmatn = Vazirmatn({ subsets: ['arabic'], variable: '--font-arabic', display: 'swap' });
export const metadata: Metadata = {
  title: { default: 'Datamine · Business workspace', template: '%s · Datamine' },
  description: 'Bring your businesses, teams, and WhatsApp conversations together.',
  robots: { index: false, follow: false },
};
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return (
    <html
      lang={locale}
      dir={locale === 'en' ? 'ltr' : 'rtl'}
      className={`${hostGrotesk.variable} ${vazirmatn.variable}`}
    >
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
