'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Copy, ShieldCheck } from 'lucide-react';
import type { WorkspaceData } from '@/lib/workspace';
import { Button } from './ui/button';
import { Dialog } from './dialog';
export type FormKind = 'agency' | 'invite' | 'connection';
export function WorkspaceForm({
  kind,
  data,
  close,
}: {
  kind: FormKind;
  data: WorkspaceData;
  close: () => void;
}) {
  const t = useTranslations(),
    locale = useLocale(),
    router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [inviteUrl, setInviteUrl] = useState(''),
    [copied, setCopied] = useState(false);
  const title = t(
    kind === 'agency' ? 'createAgency' : kind === 'invite' ? 'inviteMember' : 'connectNumber',
  );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = Object.fromEntries(new FormData(e.currentTarget));
      const response = await fetch(
        `/api/${kind === 'agency' ? 'agencies' : kind === 'invite' ? 'invitations' : 'connections'}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            ...(kind === 'invite' ? { locale } : {}),
            ...(kind === 'agency'
              ? {
                  categories: String(payload.categories)
                    .split(/[,،]/)
                    .map((s) => s.trim())
                    .filter(Boolean),
                }
              : {}),
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        setError(t(`errors.${result.error || 'serverError'}`));
        return;
      }
      router.refresh();
      if (result.url) setInviteUrl(result.url);
      else close();
    } catch {
      setError(t('errors.serverError'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={inviteUrl ? t('inviteReady') : title} close={close}>
      {inviteUrl ? (
        <div className="modal-body">
          <div className="notice success">
            <ShieldCheck />
            <p>{t('inviteLinkHelp')}</p>
          </div>
          <input aria-label={t('copyLink')} value={inviteUrl} readOnly dir="ltr" />
          <Button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(inviteUrl);
                setCopied(true);
              } catch {
                setError(t('errors.serverError'));
              }
            }}
          >
            <Copy size={16} />
            {t(copied ? 'copied' : 'copyLink')}
          </Button>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
      ) : (
        <form className="modal-body" onSubmit={submit}>
          {kind !== 'agency' && (
            <label>
              {t('agency')}
              <select name="agencyId" required>
                {data.agencies
                  .filter((a) => ['owner', 'admin'].includes(a.role))
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {kind === 'agency' && (
            <>
              <label>
                {t('agencyName')}
                <input name="name" required minLength={2} maxLength={80} />
              </label>
              <label>
                {t('agencySlug')}
                <input
                  name="slug"
                  required
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  maxLength={60}
                  dir="ltr"
                />
              </label>
              <p className="form-hint">{t('slugHint')}</p>
              <label>
                {t('categoriesLabel')}
                <input name="categories" defaultValue="" maxLength={720} />
              </label>
              <p className="form-hint">{t('categoriesHint')}</p>
              <label>
                {t('businessType')}
                <input
                  name="industry"
                  placeholder={t('businessTypeHint')}
                  maxLength={100}
                  required
                />
              </label>
              <label>
                {t('preferredLanguage')}
                <select name="locale" defaultValue={locale}>
                  <option value="en">English</option>
                  <option value="ar">العربية</option>
                  <option value="ckb">کوردی</option>
                </select>
              </label>
            </>
          )}
          {kind === 'invite' && (
            <>
              <label>
                {t('email')}
                <input type="email" name="email" required maxLength={254} />
              </label>
              <label>
                {t('role')}
                <select name="role">
                  <option value="agent">{t('agent')}</option>
                  <option value="admin">{t('admin')}</option>
                  <option value="viewer">{t('viewer')}</option>
                </select>
              </label>
              <p className="form-hint">{t('inviteHelp')}</p>
            </>
          )}
          {kind === 'connection' && (
            <>
              <p className="form-hint">{t('metaHelp')}</p>
              <label>
                {t('connectionLabel')}
                <input name="label" required minLength={2} maxLength={80} />
              </label>
              <div className="form-grid">
                <label>
                  {t('phoneNumberId')}
                  <input
                    name="phoneNumberId"
                    required
                    pattern="[0-9]{5,30}"
                    inputMode="numeric"
                    dir="ltr"
                  />
                </label>
                <label>
                  {t('wabaId')}
                  <input
                    name="wabaId"
                    required
                    pattern="[0-9]{5,30}"
                    inputMode="numeric"
                    dir="ltr"
                  />
                </label>
              </div>
              <label>
                {t('accessToken')}
                <input
                  type="password"
                  name="accessToken"
                  required
                  minLength={20}
                  maxLength={4000}
                  autoComplete="off"
                  dir="ltr"
                />
              </label>
              <label>
                {t('appSecret')}
                <input
                  type="password"
                  name="appSecret"
                  required
                  pattern="[a-fA-F0-9]{32}"
                  autoComplete="off"
                  dir="ltr"
                />
              </label>
            </>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <Button type="button" variant="outline" onClick={close}>
              {t('cancel')}
            </Button>
            <Button disabled={busy}>
              {busy
                ? t('loading')
                : t(
                    kind === 'agency'
                      ? 'createAgency'
                      : kind === 'invite'
                        ? 'createInvite'
                        : 'verifyConnect',
                  )}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
