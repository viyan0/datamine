'use client';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Copy, MessageCircle, Plus, Radio } from 'lucide-react';
import type { WorkspaceData } from '@/lib/workspace';
import type { FormKind } from './workspace-form';
import { Button } from './ui/button';
import { Avatar } from './ui/avatar';
import { Empty } from './ui/empty';
import { CentralWhatsapp } from './central-whatsapp';
import { OfferFollowUpSettings } from './offer-follow-up-settings';

export function WhatsAppPage({
  data,
  demo,
  manage,
  openForm,
}: {
  data: WorkspaceData;
  demo: boolean;
  manage: boolean;
  openForm: (kind: FormKind, agencyId?: string) => void;
}) {
  const t = useTranslations(),
    locale = useLocale();
  const admin = data.user.platformAdmin;
  function date(value: string) {
    return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(
      new Date(value),
    );
  }
  return (
    <div className="page-stack">
      <div className="connections-overview">
        <CentralWhatsapp data={data} demo={demo} />
        {admin && <OfferFollowUpSettings data={data} demo={demo} />}
        <WebhookPanel demo={demo} admin={admin} />
      </div>
      {admin && data.connections.length > 0 && (
        <div className="connection-grid">
          {data.connections.map((c, i) => (
            <article className="panel connection-card" key={c.id}>
              <div className="connection-card-top">
                <span className="stat-icon mint">
                  <MessageCircle size={22} />
                </span>
                <span
                  className={`badge ${c.status === 'receiving' ? 'badge-green' : 'badge-neutral'}`}
                >
                  <i />
                  {t(c.status)}
                </span>
              </div>
              <h2>{c.label}</h2>
              <p className="phone-display" dir="ltr">
                {c.displayPhone}
              </p>
              <div className="connection-agency">
                <Avatar name={c.agencyName} index={i} />
                <span>{c.agencyName}</span>
              </div>
              <footer>
                <Radio size={14} />
                {c.lastWebhookAt
                  ? t('lastReceived', { date: date(c.lastWebhookAt) })
                  : t('webhookWaiting')}
              </footer>
            </article>
          ))}
        </div>
      )}
      {admin && !data.connections.length && (
        <section className="panel">
          <Empty icon={MessageCircle} title={t('noConnections')} subtitle={t('noConnectionsSub')}>
            {manage && (
              <Button onClick={() => openForm('connection')}>
                <Plus size={16} />
                {t('connectNumber')}
              </Button>
            )}
          </Empty>
        </section>
      )}
    </div>
  );
}

function WebhookPanel({ demo, admin }: { demo: boolean; admin: boolean }) {
  const t = useTranslations(),
    [copied, setCopied] = useState(''),
    [error, setError] = useState('');
  async function copy(field: 'callbackUrl' | 'verifyToken') {
    try {
      const r = await fetch('/api/setup');
      if (!r.ok) throw new Error();
      const data = await r.json();
      await navigator.clipboard.writeText(data[field]);
      setCopied(field);
    } catch {
      setError(t('errors.serverError'));
    }
  }
  return (
    <section className="panel settings-card webhook-panel">
      <span className="settings-icon">
        <Radio />
      </span>
      <h2>{t('webhookTitle')}</h2>
      <p>{t('webhookHelp')}</p>
      {!demo && admin && (
        <div className="webhook-actions">
          <Button variant="outline" onClick={() => copy('callbackUrl')}>
            <Copy size={15} />
            {t(copied === 'callbackUrl' ? 'copied' : 'copyCallback')}
          </Button>
          <Button variant="outline" onClick={() => copy('verifyToken')}>
            <Copy size={15} />
            {t(copied === 'verifyToken' ? 'copied' : 'copyToken')}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  );
}
