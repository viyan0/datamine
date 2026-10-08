'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Megaphone, Plus, Send, Sparkles, Users, MessageCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog } from './dialog';
import type { WorkspaceData } from '@/lib/workspace';
import type { CampaignView } from '@/lib/campaign-types';
import type { ApprovedTemplate } from '@/lib/meta';
import { demoCampaigns } from '@/lib/demo-campaigns';

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
    [configured, setConfigured] = useState(demo);
  const [setup, setSetup] = useState<{
    sender: { id: string; label: string; displayPhone: string } | null;
    templates: ApprovedTemplate[];
  }>({ sender: null, templates: [] });
  const [senderId, setSenderId] = useState(data.connections[0]?.id || ''),
    [setupError, setSetupError] = useState('');
  const admin = data.user.platformAdmin,
    canCreate = data.agencies.some((a) => ['owner', 'admin', 'agent'].includes(a.role));
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
    if (demo || !admin) return;
    let active = true;
    api('/api/campaigns/setup')
      .then((s) => {
        if (active) setSetup(s);
      })
      .catch((e) => {
        if (active) setSetupError(e.message);
      });
    return () => {
      active = false;
    };
  }, [demo, admin]);
  const current = items.find((c) => c.id === selected) || items[0];
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
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const input = Object.fromEntries(new FormData(e.currentTarget));
    try {
      if (demo) {
        const id = crypto.randomUUID();
        setItems((all) => [
          {
            id,
            agencyId: String(input.agencyId),
            agencyName: data.agencies.find((a) => a.id === input.agencyId)!.name,
            title: String(input.title),
            offerText: String(input.offerText),
            locale: String(input.locale),
            status: 'demoDraft',
            createdAt: new Date().toISOString(),
            error: null,
            analysis: null,
            template: null,
            recipients: [],
          },
          ...all,
        ]);
        setSelected(id);
      } else {
        const result = await api('/api/campaigns', input);
        setSelected(result.id);
        setItems((await api('/api/campaigns')).campaigns);
      }
      setCreating(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'serverError');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="notice subtle">
        <Sparkles size={20} />
        <p>{t(demo ? 'demoHint' : 'automaticHint')}</p>
      </div>
      {!configured && !demo && <p className="notice">{t('aiSetup')}</p>}
      <div className="toolbar">
        <span>{t('count', { count: items.length })}</span>
        {canCreate && (
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} />
            {t('newOffer')}
          </Button>
        )}
      </div>
      {admin && !demo && (
        <details className="panel campaign-setup">
          <summary>
            <MessageCircle size={16} />
            {t('senderSetup')}
            {setup.sender && (
              <span>
                {' '}
                · {setup.sender.label} · {setup.sender.displayPhone}
              </span>
            )}
          </summary>
          <p>{t('senderHint')}</p>
          <div className="campaign-controls">
            <select
              aria-label={t('sender')}
              value={senderId}
              onChange={(e) => setSenderId(e.target.value)}
            >
              {data.connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.agencyName} · {c.label}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              disabled={!senderId || busy}
              onClick={async () => {
                setBusy(true);
                setSetupError('');
                try {
                  await api('/api/campaigns/setup', { id: senderId });
                  setSetup(await api('/api/campaigns/setup'));
                } catch (e) {
                  setSetupError(e instanceof Error ? e.message : 'serverError');
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t('useSender')}
            </Button>
          </div>
          {setupError && (
            <p className="form-error" role="alert">
              {errors.has(setupError) ? errors(setupError) : errors('serverError')}
            </p>
          )}
        </details>
      )}
      {error && (
        <p className="form-error" role="alert">
          {errors.has(error) ? errors(error) : errors('serverError')}
        </p>
      )}
      <div className="campaign-layout">
        <aside className="panel campaign-list">
          {items.map((c) => (
            <button
              className={current?.id === c.id ? 'selected' : ''}
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
        </aside>
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
              {current.status === 'demoDraft' && <p className="notice">{t('demoDraftHint')}</p>}
              {admin && (
                <>
                  {!demo && !['sending', 'complete', 'cancelled'].includes(current.status) && (
                    <label>
                      {t('template')}
                      <select
                        value={current.template?.id || ''}
                        disabled={busy}
                        onChange={(e) => {
                          if (e.target.value)
                            void action({ action: 'template', templateId: e.target.value });
                        }}
                      >
                        <option value="">{t('chooseTemplate')}</option>
                        {setup.templates
                          .filter(
                            (p) =>
                              p.language === current.locale ||
                              p.language.startsWith(`${current.locale}_`),
                          )
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} · {p.language}
                            </option>
                          ))}
                      </select>
                      <small>{t('templateHint')}</small>
                    </label>
                  )}
                  {current.template && (
                    <div className="campaign-message">
                      <strong>{t('messagePreview')}</strong>
                      <p dir="auto">{current.template.body}</p>
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
                      </article>
                    ))}
                  </div>
                  <p className="form-hint">{t('consentHint')}</p>
                  <div className="campaign-actions">
                    <Button
                      disabled={
                        busy ||
                        current.status !== 'ready' ||
                        !current.template ||
                        !current.recipients?.length
                      }
                      onClick={() => action({ action: 'send' })}
                    >
                      <Send size={15} />
                      {t(demo ? 'simulate' : 'send')}
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
              {!admin && <p className="notice">{t('reviewHint')}</p>}
            </div>
          </section>
        )}
      </div>
      {creating && (
        <Dialog title={t('newOffer')} close={() => setCreating(false)}>
          <form className="modal-body" onSubmit={create}>
            <p className="form-hint">{t('submitHint')}</p>
            <label>
              {t('business')}
              <select name="agencyId">
                {data.agencies
                  .filter((a) => ['owner', 'admin', 'agent'].includes(a.role))
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {t('title')}
              <input name="title" required minLength={2} maxLength={100} />
            </label>
            <label>
              {t('offerText')}
              <textarea name="offerText" required minLength={10} maxLength={3000} rows={5} />
            </label>
            <label>
              {t('language')}
              <select name="locale" defaultValue={locale}>
                <option value="en">English</option>
                <option value="ar">العربية</option>
                <option value="ckb">کوردی</option>
              </select>
            </label>
            {error && (
              <p role="alert" className="form-error">
                {errors.has(error) ? errors(error) : errors('serverError')}
              </p>
            )}
            <Button disabled={busy}>{t('submit')}</Button>
          </form>
        </Dialog>
      )}
    </>
  );
}
