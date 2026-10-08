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
      <section className="auth-story">
        <Brand light />
        <div className="story-copy">
          <p className="eyebrow">{t('heroEyebrow')}</p>
          <h1>
            {t('heroTitle')
              .split('\n')
              .map((line, i) => (
                <span key={i}>
                  {line}
                  <br />
                </span>
              ))}
          </h1>
          <p>{t('heroText')}</p>
        </div>
        <JourneyArt />
        <div className="story-footer">
          <span>
            <span className="small-dot" />
            {t('heroBadge')}
          </span>
          <p>{t('heroFooter')}</p>
        </div>
      </section>
      <section className="auth-panel">
        <header>
          <Brand />
          <LanguageSwitch />
        </header>
        <div className="auth-form-wrap">
          <div className="auth-icon">
            <ArrowUpRight size={26} />
          </div>
          <p className="eyebrow">{t('brandTag')}</p>
          <h2>{t(invite ? 'inviteTitle' : 'signInTitle')}</h2>
          <p className="muted auth-intro">{t(invite ? 'inviteSub' : 'signInSub')}</p>
          {done ? (
            <div className="success-panel">
              <Check />
              <p>{t('inviteSuccess')}</p>
              <Button asChild>
                <Link href={`/${locale}`}>{t('signIn')}</Link>
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
              <Button className="full-width" disabled={busy}>
                {busy ? t('loading') : t(invite ? 'acceptInvite' : 'signInButton')}
                <ArrowRight size={17} className="directional" />
              </Button>
            </form>
          )}
          <p className="auth-foot">
            <LockKeyhole size={14} />
            {t('signInFoot')}
          </p>
          {!invite && (
            <Link href={`/${locale}/demo`} className="demo-link">
              {t('viewDemo')}
              <ArrowUpRight size={16} />
            </Link>
          )}
        </div>
        <footer>
          © {new Date().getFullYear()} Datamine <span>{t('brandTag')}</span>
        </footer>
      </section>
    </main>
  );
}
