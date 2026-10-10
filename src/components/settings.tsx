'use client';
import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { LockKeyhole, Users } from 'lucide-react';
import type { WorkspaceData } from '@/lib/workspace';
import { authClient } from '@/lib/auth-client';
import { Button } from './ui/button';
import { Avatar } from './ui/avatar';
import { LanguageSwitch } from './language-switch';
import { BusinessSettings } from './business-settings';

export function SettingsPage({ data, demo }: { data: WorkspaceData; demo: boolean }) {
  const t = useTranslations();
  return (
    <div className="settings-grid">
      <section className="panel settings-card">
        <span className="settings-icon">
          <Users />
        </span>
        <h2>{t('profile')}</h2>
        <div className="profile-block">
          <Avatar name={data.user.name} />
          <div>
            <strong>{data.user.name}</strong>
            <p dir="ltr">{data.user.email}</p>
          </div>
        </div>
        <hr />
        <h3>{t('interfaceLanguage')}</h3>
        <LanguageSwitch />
      </section>
      <BusinessSettings data={data} demo={demo} />
      <PasswordPanel demo={demo} />
    </div>
  );
}

function PasswordPanel({ demo }: { demo: boolean }) {
  const t = useTranslations(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (demo) {
      setMessage(t('demoReadOnly'));
      return;
    }
    const form = e.currentTarget,
      data = new FormData(form);
    setBusy(true);
    try {
      const result = await authClient.changePassword({
        currentPassword: String(data.get('currentPassword')),
        newPassword: String(data.get('newPassword')),
        revokeOtherSessions: true,
      });
      setMessage(t(result.error ? 'passwordChangeError' : 'passwordChanged'));
      if (!result.error) form.reset();
    } catch {
      setMessage(t('passwordChangeError'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel settings-card">
      <span className="settings-icon">
        <LockKeyhole />
      </span>
      <h2>{t('accountSecurity')}</h2>
      <form onSubmit={submit}>
        <label>
          {t('currentPassword')}
          <input name="currentPassword" type="password" autoComplete="current-password" required />
        </label>
        <label>
          {t('newPassword')}
          <input
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />
        </label>
        <p className="form-hint">{t('passwordHint')}</p>
        <Button disabled={busy}>{t(busy ? 'loading' : 'changePassword')}</Button>
        {message && (
          <p role="status" className="form-hint">
            {message}
          </p>
        )}
      </form>
    </section>
  );
}
