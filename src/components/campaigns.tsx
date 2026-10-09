'use client';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Megaphone, Plus, Send, Sparkles, Users, MessageCircle } from 'lucide-react';
import { Button } from './ui/button';
import { NetworkFields, OfferCreateDialog, publicationInput } from './offer-create-dialog';
import type { WorkspaceData } from '@/lib/workspace';
import type { CampaignView } from '@/lib/campaign-types';
import type { ManagedTemplate } from '@/lib/template-types';
import { OfferTemplate } from './offer-template';
import { demoCampaigns } from '@/lib/demo-campaigns';
import { campaignReplyBody } from '@/lib/campaign-delivery';

async function api(path: string, body?: unknown) {
  const r = await fetch(path, {
    method: body ? 'POST' : 'GET',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error);
  return data;
}
export function Campaigns({ data, demo }: { data: WorkspaceData; demo: boolean }) {
  const t = useTranslations('offers'),
    errors = useTranslations('errors'),
    locale = useLocale();
  const [items, setItems] = useState<CampaignView[]>(demo ? demoCampaigns : []),
    [selected, setSelected] = useState(''),
    [creating, setCreating] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [configured, setConfigured] = useState<boolean | null>(demo ? true : null);
  const [setup, setSetup] = useState<{
    sender: { id: string; label: string; displayPhone: string } | null;
    templates: ManagedTemplate[];
    campaignId: string;
  }>({ sender: null, templates: [], campaignId: '' });
  const [setupError, setSetupError] = useState('');
  const admin = data.user.platformAdmin,
    canCreate = admin || data.agencies.some((a) => ['owner', 'admin'].includes(a.role));
  const current = items.find((c) => c.id === selected) || items[0];
  const currentId = current?.id;
  const canManage =
    admin ||
    data.agencies.some((a) => a.id === current?.agencyId && ['owner', 'admin'].includes(a.role));
  const currentSetup = setup.campaignId === currentId ? setup : { sender: null, templates: [] };
  useEffect(() => {
    if (demo) return;
    let active = true,
      running = false;
    const load = async () => {
      if (running) return;
      running = true;
      try {
        const result = await api('/api/campaigns');
        if (active) {
          setItems(result.campaigns);
          setConfigured(result.configured);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'serverError');
      } finally {
        running = false;
      }
    };
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 4000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [demo]);
  useEffect(() => {
    if (demo || !canManage || !currentId) return;
    let active = true,
      running = false;
    const load = async () => {
      if (running) return;
      running = true;
      try {
        const s = await api(`/api/campaigns/setup?campaignId=${encodeURIComponent(currentId)}`);
        if (active) {
          setSetup({ ...s, campaignId: currentId });
          setSetupError('');
        }
      } catch (e) {
        if (active) setSetupError(e instanceof Error ? e.message : 'serverError');
      } finally {
        running = false;
      }
    };
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [demo, canManage, currentId]);
  const approved =
    !!current?.template &&
    currentSetup.templates.some(
      (template) => template.id === current.template?.id && template.status === 'APPROVED',
    );
  const replyCount =
    current?.recipients?.filter(
      (person) => person.status === 'matched' && !!person.replyWindowExpiresAt,
    ).length || 0;
  const sendMode = approved ? 'template' : 'reply';
  const showReply =
    !demo &&
    (current?.status === 'complete' || current?.status === 'sending'
      ? current.deliveryMode === 'reply'
      : !approved);
  async function action(body: unknown) {
    if (!current || busy) return;
    setBusy(true);
    setError('');
    try {
      if (demo) {
        const a = (body as { action: string }).action;
        setItems((all) =>
          all.map((c) =>
            c.id === current.id
              ? {
                  ...c,
                  status: a === 'cancel' ? 'cancelled' : 'complete',
                  recipients: c.recipients?.map((r) => ({
                    ...r,
                    status: a === 'cancel' ? 'cancelled' : 'simulated',
                  })),
                }
              : c,
          ),
        );
      } else {
        await api(`/api/campaigns/${current.id}`, body);
        const result = await api('/api/campaigns');
        setItems(result.campaigns);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'serverError');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {demo && <p className="form-hint">{t('demoHint')}</p>}
      {configured === false && !demo && <p className="notice">{t('aiSetup')}</p>}
      <div className="toolbar">
        <span>{t('count', { count: items.length })}</span>
        {canCreate && (
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} />
            {t('newOffer')}
          </Button>
        )}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {errors.has(error) ? errors(error) : errors('serverError')}
        </p>
      )}
      {setupError && (
        <p className="form-error" role="alert">
          {errors.has(setupError) ? errors(setupError) : errors('serverError')}
        </p>
      )}
      <div className="campaign-layout">
        <div className="campaign-list">
          {items.map((c) => (
            <button
              className={current?.id === c.id ? 'selected' : ''}
              aria-pressed={current?.id === c.id}
              key={c.id}
              onClick={() => {
                setSelected(c.id);
                setError('');
              }}
            >
              <Megaphone size={17} />
              <span>
                <strong>{c.title}</strong>
                <small>{c.agencyName}</small>
              </span>
              <span className="badge badge-neutral">{t(c.status)}</span>
            </button>
          ))}
          {!items.length && (
            <div className="empty-state">
              <Megaphone size={28} />
              <h3>{t('empty')}</h3>
              <p>{t('emptyHint')}</p>
            </div>
          )}
        </div>
        {current && (
          <section className="panel campaign-detail">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{current.agencyName}</p>
                <h2>{current.title}</h2>
              </div>
              <span className="badge badge-green">{t(current.status)}</span>
            </div>
            <div className="campaign-body">
              <p className="campaign-offer" dir="auto">
                {current.offerText}
              </p>
              {current.networkEnabled &&
                current.networkExpiresAt &&
                current.status !== 'cancelled' && (
                  <p className="notice" role="status">
                    {t('networkAvailable', {
                      date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                        new Date(current.networkExpiresAt),
                      ),
                    })}
                  </p>
                )}
              {current.status === 'demoDraft' && <p className="notice">{t('demoDraftHint')}</p>}
              {canManage && !demo && current.status !== 'cancelled' && (
                <details className="offer-template-tools">
                  <summary>{t('networkPublish')}</summary>
                  <form
                    className="modal-body"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const input = publicationInput(new FormData(event.currentTarget));
                      void action({
                        action: 'network',
                        enabled: input.networkEnabled,
                        expiresAt: input.networkExpiresAt,
                      });
                    }}
                  >
                    <NetworkFields
                      key={`${current.id}:${current.networkEnabled}:${current.networkExpiresAt}`}
                      campaign={current}
                      disabled={busy}
                    />
                    <p className="form-hint">{t('networkHint')}</p>
                    <Button variant="outline" disabled={busy}>
                      {t('networkSave')}
                    </Button>
                  </form>
                </details>
              )}
              {canManage && (
                <>
                  {!demo && !['sending', 'complete', 'cancelled'].includes(current.status) && (
                    <>
                      {showReply && current.status === 'ready' && !!current.recipients?.length && (
                        <div
                          className={`offer-readiness ${replyCount ? 'ready' : ''}`}
                          role="status"
                        >
                          <MessageCircle size={20} />
                          <div>
                            <strong>
                              {t(replyCount ? 'replyReady' : 'replyNeedsMessage', {
                                count: replyCount,
                              })}
                            </strong>
                            <p>
                              {t(replyCount ? 'replyReadyHint' : 'replyNeedsMessageHint', {
                                sender: current.replySenderLabel || t('sender'),
                              })}
                            </p>
                          </div>
                        </div>
                      )}
                      <details className="offer-template-tools">
                        <summary>{t('templateTools')}</summary>
                        <OfferTemplate
                          key={current.id}
                          campaign={current}
                          templates={currentSetup.templates}
                          disabled={busy}
                          connected={!!currentSetup.sender && !setupError}
                          onSelect={(templateId) => void action({ action: 'template', templateId })}
                          onCreated={async () => {
                            const [result, s] = await Promise.all([
                              api('/api/campaigns'),
                              api(
                                `/api/campaigns/setup?campaignId=${encodeURIComponent(current.id)}`,
                              ),
                            ]);
                            setItems(result.campaigns);
                            setSetup({ ...s, campaignId: current.id });
                            setSetupError('');
                          }}
                        />
                      </details>
                    </>
                  )}
                  {(current.template || showReply) && (
                    <div className="campaign-message">
                      <strong>{t('messagePreview')}</strong>
                      <p dir="auto">
                        {showReply
                          ? campaignReplyBody({ ...current, businessName: current.agencyName })
                          : current.template?.body}
                      </p>
                    </div>
                  )}
                  {current.analysis && (
                    <div className="campaign-insights">
                      <h3>
                        <Sparkles size={16} />
                        {t('audienceTitle')}
                      </h3>
                      <p dir="auto">{current.analysis.summary}</p>
                      <div className="analysis-tags">
                        {current.analysis.categories.map((c) => (
                          <span key={c}>{c}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {['matching', 'error'].includes(current.status) && (
                    <p className="notice">
                      {t(current.status === 'matching' ? 'matchingHint' : 'retrying')}
                    </p>
                  )}
                  {current.error && (
                    <p className="form-error">
                      {errors.has(current.error) ? errors(current.error) : errors('serverError')}
                    </p>
                  )}
                  <div className="audience-heading">
                    <Users size={16} />
                    <strong>
                      {t('audienceCount', { count: current.recipients?.length || 0 })}
                    </strong>
                  </div>
                  <div className="campaign-audience">
                    {current.recipients?.map((r) => (
                      <article key={r.id}>
                        <div>
                          <strong>{r.name}</strong>
                          <span dir="ltr">{r.phone}</span>
                        </div>
                        <p dir="auto">{r.reason}</p>
                        <span className="badge badge-neutral">
                          {t.has(r.status) ? t(r.status) : r.status}
                        </span>
                        {showReply && r.status === 'matched' && (
                          <small className="recipient-window">
                            {r.replyWindowExpiresAt
                              ? t('replyUntil', {
                                  time: new Intl.DateTimeFormat(locale, {
                                    dateStyle: 'short',
                                    timeStyle: 'short',
                                  }).format(new Date(r.replyWindowExpiresAt)),
                                })
                              : t('windowClosed')}
                          </small>
                        )}
                      </article>
                    ))}
                  </div>
                  <p className="form-hint">{t('consentHint')}</p>
                  <div className="campaign-actions">
                    <Button
                      disabled={
                        busy ||
                        current.status !== 'ready' ||
                        (demo ? !current.template : !approved && replyCount === 0) ||
                        !current.recipients?.length
                      }
                      onClick={() => action({ action: 'send', mode: sendMode })}
                    >
                      <Send size={15} />
                      {t(demo ? 'simulate' : showReply ? 'sendReply' : 'send')}
                    </Button>
                    {!['complete', 'cancelled'].includes(current.status) && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => action({ action: 'cancel' })}
                      >
                        {t('cancel')}
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          </section>
        )}
      </div>
      {creating && (
        <OfferCreateDialog
          data={data}
          demo={demo}
          close={() => setCreating(false)}
          onCreated={(campaign) => {
            setItems((all) => [campaign, ...all]);
            setSelected(campaign.id);
            setCreating(false);
          }}
        />
      )}
    </>
  );
}
