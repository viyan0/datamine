'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Check, ShieldCheck, MessageCircle } from 'lucide-react';
import { Brand } from './brand';
import { LanguageSwitch } from './language-switch';
import { Button } from './ui/button';
import { profileFields, type CustomerAccess, type SharedProfile } from '@/lib/enrollment-types';
import { readDemoProfile, writeDemoProfile } from '@/lib/demo-enrollment';

async function customerApi(action: string, payload?: unknown) {
  const response = await fetch(`/api/customer/${action}`, {
    method: payload ? 'POST' : 'GET',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'serverError');
  return data;
}
export function CustomerPortal({ demo = false }: { demo?: boolean }) {
  const t = useTranslations('enrollment'),
    errors = useTranslations('errors'),
    locale = useLocale();
  const [token, setToken] = useState(''),
    [invite, setInvite] = useState<{ maskedPhone: string; agency: string } | null>(null);
  const [access, setAccess] = useState<CustomerAccess | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(''),
    [code, setCode] = useState(''),
    [sent, setSent] = useState(false),
    [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(async () => {
        if (demo) {
          if (active) setInvite({ maskedPhone: '•••• 0301', agency: 'Datamine demo' });
          return;
        }
        const value = window.location.hash.slice(1);
        if (value) {
          const info = await customerApi('access', { token: value });
          if (active) {
            setToken(value);
            setInvite(info);
          }
        } else {
          const data = await customerApi('profile');
          if (active) setAccess(data);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [demo]);
  async function sendCode() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = demo ? {} : await customerApi('code', { token, locale });
      setSent(true);
      setNotice(result.uncertain ? 'codeUncertain' : 'codeSent');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'serverError');
    } finally {
      setBusy(false);
    }
  }
  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (demo) {
        if (code !== '123456') throw new Error('codeInvalid');
        setAccess({ phone: '+000 000 301', profile: readDemoProfile() });
      } else {
        await customerApi('verify', { token, code });
        setAccess(await customerApi('profile'));
        // Remove the invitation from the address bar once exchanged for an HttpOnly session.
        window.history.replaceState(null, '', window.location.pathname);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'serverError');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="customer-portal">
      <header className="portal-header">
        <Brand />
        <LanguageSwitch />
      </header>
      <main className="portal-card">
        <span className="portal-icon">
          <ShieldCheck size={26} />
        </span>
        <p className="eyebrow">{t('eyebrow')}</p>
        <h1>{t(access ? 'preferencesTitle' : 'title')}</h1>
        <p className="portal-intro">{t(access ? 'preferencesHint' : 'intro')}</p>
        {demo && (
          <div className="notice">
            <p>{t('demoHint')}</p>
          </div>
        )}
        {loading ? (
          <p role="status">{t('loading')}</p>
        ) : access ? (
          <PreferenceForm key={access.phone} access={access} demo={demo} onUpdate={setAccess} />
        ) : invite ? (
          <>
            <div className="verify-summary">
              <MessageCircle size={19} />
              <span>{t('verifyHint', { business: invite.agency, phone: invite.maskedPhone })}</span>
            </div>
            <Button disabled={busy} variant={sent ? 'outline' : 'default'} onClick={sendCode}>
              {t(busy ? 'loading' : sent ? 'resend' : 'sendCode')}
            </Button>
            {sent && (
              <form onSubmit={verify} className="verification-form">
                <label>
                  {t('code')}
                  <input
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    dir="ltr"
                  />
                </label>
                {demo && <p className="form-hint">{t('demoCode')}</p>}
                <Button disabled={busy || code.length !== 6}>{t('verify')}</Button>
              </form>
            )}
            <p className="portal-footnote">{t('verificationOnly')}</p>
          </>
        ) : null}
        {notice && (
          <p className="form-hint" role="status">
            {t(notice)}
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {errors.has(error) ? errors(error) : errors('serverError')}
          </p>
        )}
        {demo && (
          <Link className="portal-back" href={`/${locale}/demo/customers`}>
            {t('backToDirectory')}
          </Link>
        )}
      </main>
      <p className="portal-footer">{t('privacy')}</p>
    </div>
  );
}
function PreferenceForm({
  access,
  demo,
  onUpdate,
}: {
  access: CustomerAccess;
  demo: boolean;
  onUpdate: (data: CustomerAccess) => void;
}) {
  const t = useTranslations('enrollment'),
    errors = useTranslations('errors'),
    locale = useLocale();
  const [name, setName] = useState(access.profile?.name || ''),
    [language, setLanguage] = useState(access.profile?.language || locale);
  const [topic, setTopic] = useState(access.profile?.destination || ''),
    [interests, setInterests] = useState(access.profile?.interests.join(', ') || '');
  const [consent, setConsent] = useState(false),
    [rejoin, setRejoin] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false);
  const enrolling = !access.profile || rejoin;
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const parsed = profileFields.safeParse({
        name,
        language,
        destination: topic,
        interests: interests
          .split(/[,،]/)
          .map((s) => s.trim())
          .filter(Boolean),
      });
      if (!parsed.success || (enrolling && !consent)) throw new Error('invalidInput');
      let data: CustomerAccess;
      if (demo) {
        const profile: SharedProfile = {
          ...parsed.data,
          id: 'demo-enrolled',
          phone: access.phone,
          status: enrolling ? 'active' : access.profile!.status,
          consentAt: enrolling ? new Date().toISOString() : access.profile!.consentAt,
          updatedAt: new Date().toISOString(),
        };
        writeDemoProfile(profile);
        data = { phone: access.phone, profile };
      } else
        data = await customerApi(enrolling ? 'profile' : 'preferences', {
          ...parsed.data,
          locale,
          ...(enrolling ? { consent } : {}),
        });
      onUpdate(data);
      setConsent(false);
      setRejoin(false);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'serverError');
    } finally {
      setBusy(false);
    }
  }
  async function optOut() {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      if (demo) {
        const profile = {
          ...access.profile!,
          status: 'optedOut',
          updatedAt: new Date().toISOString(),
        };
        writeDemoProfile(profile);
        onUpdate({ ...access, profile });
      } else onUpdate(await customerApi('opt-out', { locale }));
      setConsent(false);
      setRejoin(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'serverError');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="verified-phone">
        <span>
          <Check size={15} />
          {t('verified')}
        </span>
        <b dir="ltr">{access.phone}</b>
      </div>
      {access.profile && (
        <p
          className={`notice ${access.profile.status === 'active' ? 'success' : ''}`}
          role="status"
        >
          {t(access.profile.status === 'active' ? 'enrolled' : 'optedOutHint')}
        </p>
      )}
      <form className="preferences-form" onSubmit={submit}>
        <fieldset disabled={busy}>
          <label>
            {t('name')}
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSaved(false);
              }}
              maxLength={120}
              autoComplete="name"
              required
            />
          </label>
          <label>
            {t('language')}
            <select
              value={language}
              onChange={(e) => {
                setLanguage(e.target.value);
                setSaved(false);
              }}
            >
              <option value="en">English</option>
              <option value="ar">العربية</option>
              <option value="ckb">کوردی</option>
            </select>
          </label>
          <label>
            {t('interests')}
            <input
              value={interests}
              onChange={(e) => {
                setInterests(e.target.value);
                setSaved(false);
              }}
              maxLength={720}
              placeholder={t('interestsPlaceholder')}
            />
          </label>
          <p className="form-hint">{t('interestsHint')}</p>
          <label>
            {t('topic')}
            <input
              value={topic}
              onChange={(e) => {
                setTopic(e.target.value);
                setSaved(false);
              }}
              maxLength={160}
              placeholder={t('topicPlaceholder')}
            />
          </label>
          {enrolling && (
            <div className="consent-box">
              <label>
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  required
                />
                <span>{t('consent')}</span>
              </label>
              <p>{t('consentDetails')}</p>
            </div>
          )}
          <Button disabled={busy || (enrolling && !consent)}>
            {t(busy ? 'loading' : enrolling ? 'join' : 'save')}
          </Button>
          {rejoin && (
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setRejoin(false);
                setConsent(false);
              }}
            >
              {t('cancel')}
            </Button>
          )}
        </fieldset>
      </form>
      {saved && (
        <p className="saved-message" role="status">
          <Check size={16} />
          {t('saved')}
        </p>
      )}
      {access.profile && !rejoin && (
        <div className="opt-out-actions">
          <button
            type="button"
            disabled={busy}
            onClick={
              access.profile.status === 'active'
                ? optOut
                : () => {
                    setRejoin(true);
                    setConsent(false);
                    setSaved(false);
                  }
            }
          >
            {t(access.profile.status === 'active' ? 'optOut' : 'rejoin')}
          </button>
          <p>{t('optOutNote')}</p>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {errors.has(error) ? errors(error) : errors('serverError')}
        </p>
      )}
      <p className="portal-footnote">{t('returnHint')}</p>
    </>
  );
}
