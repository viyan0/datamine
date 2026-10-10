'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight, ArrowUpRight, Check, LockKeyhole, Eye, EyeOff } from 'lucide-react';
import { Brand, JourneyArt } from './brand';
import { LanguageSwitch } from './language-switch';
import { Button } from './ui/button';
import { authClient } from '@/lib/auth-client';
// The interface languages, written in their own script (as in the language picker).
const interfaceLanguages = [
  { code: 'en', name: 'English' },
  { code: 'ar', name: 'العربية' },
  { code: 'ckb', name: 'کوردی' },
];
export function AuthScreen({ invite = false }: { invite?: boolean }) {
  const t = useTranslations(),
    locale = useLocale(),
    router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [done, setDone] = useState(false),
    [visible, setVisible] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(e.currentTarget);
    try {
      if (invite) {
        const response = await fetch('/api/invitations/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.get('name'),
            password: form.get('password'),
            token: window.location.hash.slice(1),
          }),
        });
        const result = await response.json();
        if (!response.ok) {
          setError(t(`errors.${result.error || 'serverError'}`));
          return;
        }
        window.history.replaceState(null, '', window.location.pathname);
        setDone(true);
      } else {
        const result = await authClient.signIn.email({
          email: String(form.get('email')),
          password: String(form.get('password')),
        });
        if (result.error) setError(t('signInError'));
        else {
          router.push(`/${locale}/app`);
          router.refresh();
        }
      }
    } catch {
      setError(t('errors.serverError'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-layout">
      <div className="auth-window">
        <section className="auth-story">
          <div className="story-head">
            <Brand light />
            <span className="story-chip">{t('heroEyebrow')}</span>
          </div>
          <div className="story-copy">
            <p className="story-title">
              {t('heroTitle')
                .split('\n')
                .map((line, i) => (
                  <span key={i}>{line}</span>
                ))}
            </p>
            <p className="story-text">{t('heroText')}</p>
          </div>
          <JourneyArt />
          <div className="story-footer">
            <div>
              <strong>{t('heroBadge')}</strong>
              <p>{t('heroFooter')}</p>
            </div>
            <ul className="story-languages">
              {interfaceLanguages.map((language) => (
                <li key={language.code} lang={language.code}>
                  {language.name}
                </li>
              ))}
            </ul>
          </div>
        </section>
        <section className="auth-panel">
          <header>
            <Brand />
            <LanguageSwitch />
          </header>
          <div className="auth-form-wrap">
            <span className="auth-icon" aria-hidden="true">
              <ArrowUpRight size={22} className="directional" />
            </span>
            <p className="auth-eyebrow">{t('brandTag')}</p>
            <h1>{t(invite ? 'inviteTitle' : 'signInTitle')}</h1>
            <p className="auth-intro">{t(invite ? 'inviteSub' : 'signInSub')}</p>
            {done ? (
              <div className="success-panel" role="status">
                <span className="success-icon">
                  <Check size={18} />
                </span>
                <p>{t('inviteSuccess')}</p>
                <Button asChild className="full-width auth-submit">
                  <Link href={`/${locale}`}>
                    <span>{t('signIn')}</span>
                    <span className="auth-submit-icon">
                      <ArrowRight size={17} className="directional" />
                    </span>
                  </Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={submit}>
                <label>
                  {t(invite ? 'name' : 'email')}
                  <input
                    name={invite ? 'name' : 'email'}
                    type={invite ? 'text' : 'email'}
                    autoComplete={invite ? 'name' : 'email'}
                    required
                    maxLength={invite ? 80 : 254}
                    placeholder={invite ? undefined : 'you@agency.com'}
                  />
                </label>
                <label>
                  {t(invite ? 'newPassword' : 'password')}
                  <span className="password-field">
                    <input
                      name="password"
                      type={visible ? 'text' : 'password'}
                      autoComplete={invite ? 'new-password' : 'current-password'}
                      minLength={invite ? 12 : undefined}
                      maxLength={128}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setVisible(!visible)}
                      aria-label={t('password')}
                      aria-pressed={visible}
                    >
                      {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </span>
                </label>
                {invite && <p className="form-hint">{t('passwordHint')}</p>}
                {error && (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}
                <Button className="full-width auth-submit" disabled={busy}>
                  <span>{busy ? t('loading') : t(invite ? 'acceptInvite' : 'signInButton')}</span>
                  <span className="auth-submit-icon">
                    <ArrowRight size={17} className="directional" />
                  </span>
                </Button>
              </form>
            )}
            <p className="auth-foot">
              <span>
                <LockKeyhole size={14} />
              </span>
              {t('signInFoot')}
            </p>
            {!invite && (
              <Button asChild variant="outline" className="full-width demo-link">
                <Link href={`/${locale}/demo`}>
                  {t('viewDemo')}
                  <ArrowUpRight size={16} className="directional" />
                </Link>
              </Button>
            )}
          </div>
          <footer>
            <span>© {new Date().getFullYear()} Datamine</span>
            <span>{t('brandTag')}</span>
          </footer>
        </section>
      </div>
    </main>
  );
}
