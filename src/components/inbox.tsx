'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Inbox,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  UserRound,
  X,
} from 'lucide-react';
import type { WorkspaceData } from '@/lib/workspace';
import { demoConversations, demoMessages } from '@/lib/demo-inbox';
import {
  inquiryStatuses,
  replyWindowOpen,
  services,
  type Conversation,
  type CustomerFields,
  type InboxMessage,
} from '@/lib/inbox-types';
import { Button } from './ui/button';
import { ConversationAnalysis } from './conversation-analysis';

async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'serverError');
  return data;
}
function ErrorNotice({ error }: { error: string }) {
  const t = useTranslations('errors');
  return error ? (
    <p className="inbox-error" role="alert">
      {t.has(error) ? t(error) : t('serverError')}
    </p>
  ) : null;
}
export function AgencyInbox({ data, demo }: { data: WorkspaceData; demo: boolean }) {
  const t = useTranslations('crm');
  const [agencyId, setAgencyId] = useState(data.agencies[0]?.id || '');
  const agency = data.agencies.find((a) => a.id === agencyId);
  return (
    <section className="inbox-workspace">
      <div className="inbox-toolbar">
        <label>
          {t('agencyInbox')}
          <select value={agencyId} onChange={(e) => setAgencyId(e.target.value)}>
            {data.agencies.map((a) => (
              <option value={a.id} key={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <span className="inbox-context">
          <MessageCircle size={16} />
          {t(demo ? 'sampleHint' : 'privateHint')}
        </span>
      </div>
      {agency ? (
        <InboxThreads
          key={agencyId}
          agencyId={agencyId}
          demo={demo}
          editable={['owner', 'admin', 'agent'].includes(agency.role)}
        />
      ) : (
        <div className="inbox-empty">
          <Inbox size={30} />
          <h3>{t('noAgency')}</h3>
        </div>
      )}
    </section>
  );
}
function InboxThreads({
  agencyId,
  demo,
  editable,
}: {
  agencyId: string;
  demo: boolean;
  editable: boolean;
}) {
  const t = useTranslations('crm');
  const initial = demo ? demoConversations.filter((c) => c.agencyId === agencyId) : [];
  const [threads, setThreads] = useState<Conversation[]>(initial);
  const [selected, setSelected] = useState<string | null>(initial[0]?.id || null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(!demo);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sampleHistory, setSampleHistory] = useState(demoMessages);
  const base = `/api/agencies/${agencyId}/conversations`;
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    api(base, { signal: controller.signal })
      .then((r) => {
        setThreads(r.conversations);
        setSelected((old) => old || r.conversations[0]?.id || null);
        setError('');
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [base, demo, revision]);
  const filtered = threads.filter(
    (c) =>
      (filter === 'all' || c.inquiryStatus === filter) &&
      `${c.name} ${c.contactPhone} ${c.destination}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  const current = filtered.find((c) => c.id === selected) || filtered[0];
  function update(id: string, fields: Partial<Conversation>) {
    setThreads((all) => all.map((c) => (c.id === id ? { ...c, ...fields } : c)));
  }
  return (
    <>
      <ErrorNotice error={error} />
      <div className={`inbox-layout ${mobileOpen && current ? 'thread-open' : ''}`}>
        <aside className="thread-list">
          <div className="thread-list-heading">
            <h2>{t('conversations')}</h2>
            <span>{threads.length}</span>
            <button
              className="icon-button"
              aria-label={t('refresh')}
              disabled={loading}
              onClick={() => {
                if (!demo) {
                  setLoading(true);
                  setRevision((n) => n + 1);
                }
              }}
            >
              <RefreshCw size={16} />
            </button>
          </div>
          <div className="inbox-search">
            <Search size={16} />
            <input
              aria-label={t('search')}
              placeholder={t('search')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="inbox-filters" role="group" aria-label={t('filterStatus')}>
            {['all', ...inquiryStatuses].map((s) => (
              <button
                key={s}
                aria-pressed={filter === s}
                className={filter === s ? 'active' : ''}
                onClick={() => setFilter(s)}
              >
                {t(s)}
              </button>
            ))}
          </div>
          <div className="thread-list-scroll">
            {filtered.map((c, i) => (
              <button
                key={c.id}
                className={`thread-item ${current?.id === c.id ? 'selected' : ''}`}
                onClick={() => {
                  setSelected(c.id);
                  setMobileOpen(true);
                }}
              >
                <span className={`avatar avatar-${i % 4}`}>
                  {c.name
                    .split(' ')
                    .slice(0, 2)
                    .map((s) => s[0])
                    .join('')}
                </span>
                <span className="thread-summary">
                  <span className="thread-name">
                    {c.name}
                    <i className={`inquiry-dot status-${c.inquiryStatus}`} />
                  </span>
                  <span className="thread-preview" dir="auto">
                    {c.preview || t('mediaMessage')}
                  </span>
                  <span className="thread-tags">
                    {t(c.service)}
                    {c.destination && <> · {c.destination}</>}
                  </span>
                </span>
              </button>
            ))}
            {!filtered.length && (
              <div className="inbox-empty">
                <Inbox size={28} />
                <h3>{t(loading ? 'loading' : threads.length ? 'noMatches' : 'emptyTitle')}</h3>
                <p>{t(threads.length ? 'searchHint' : 'emptyHint')}</p>
              </div>
            )}
          </div>
        </aside>
        {current ? (
          <ConversationView
            key={current.id}
            conversation={current}
            demo={demo}
            editable={editable}
            base={base}
            revision={revision}
            sampleMessages={sampleHistory[current.id] || []}
            onBack={() => setMobileOpen(false)}
            onUpdate={(fields) => update(current.id, fields)}
            onSampleReply={(message) =>
              setSampleHistory((all) => ({
                ...all,
                [current.id]: [...(all[current.id] || []), message],
              }))
            }
          />
        ) : (
          <div className="inbox-empty inbox-welcome">
            <MessageCircle size={38} />
            <h2>{t('chooseConversation')}</h2>
            <p>{t('chooseHint')}</p>
          </div>
        )}
      </div>
    </>
  );
}
function ConversationView({
  conversation: c,
  demo,
  editable,
  base,
  revision,
  sampleMessages,
  onBack,
  onUpdate,
  onSampleReply,
}: {
  conversation: Conversation;
  demo: boolean;
  editable: boolean;
  base: string;
  revision: number;
  sampleMessages: InboxMessage[];
  onBack: () => void;
  onUpdate: (fields: Partial<Conversation>) => void;
  onSampleReply: (message: InboxMessage) => void;
}) {
  const t = useTranslations('crm'),
    locale = useLocale();
  const [history, setHistory] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(!demo);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [details, setDetails] = useState(false);
  const request = useRef<{ id: string; body: string } | null>(null);
  const busy = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);
  const url = `${base}/${c.id}`;
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    api(url, { signal: controller.signal })
      .then((r) => {
        setHistory(r.messages);
        setError('');
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [url, demo, revision]);
  const items = demo ? sampleMessages : history;
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'nearest' });
  }, [items.length]);
  const windowOpen = demo || replyWindowOpen(c.lastInboundAt);
  async function send(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || busy.current) return;
    busy.current = true;
    setSending(true);
    setError('');
    try {
      if (!request.current || request.current.body !== body)
        request.current = { id: crypto.randomUUID(), body };
      const message: InboxMessage = demo
        ? {
            id: request.current.id,
            body,
            direction: 'outbound',
            type: 'text',
            deliveryStatus: 'simulated',
            timestamp: new Date().toISOString(),
          }
        : (
            await api(`${url}/reply`, {
              method: 'POST',
              body: JSON.stringify({ body, requestId: request.current.id }),
            })
          ).message;
      if (demo) onSampleReply(message);
      else setHistory((old) => [...old.filter((m) => m.id !== message.id), message]);
      onUpdate({ preview: body, lastMessageAt: message.timestamp });
      setDraft('');
      request.current = null;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'serverError');
    } finally {
      busy.current = false;
      setSending(false);
    }
  }
  return (
    <>
      <section className={`conversation-pane ${details ? 'details-visible' : ''}`}>
        <header className="conversation-header">
          <button className="icon-button inbox-back" aria-label={t('back')} onClick={onBack}>
            <ArrowLeft size={19} />
          </button>
          <span className="avatar avatar-0">{c.name[0]}</span>
          <div>
            <h2>{c.name}</h2>
            <p>
              <span dir="ltr">{c.contactPhone}</span> · {c.connectionLabel}
            </p>
          </div>
          <button
            className={`icon-button customer-toggle ${details ? 'active' : ''}`}
            aria-label={t('customerDetails')}
            aria-expanded={details}
            onClick={() => setDetails(!details)}
          >
            <UserRound size={19} />
          </button>
        </header>
        <ConversationAnalysis
          id={c.id}
          url={url}
          demo={demo}
          editable={editable}
          revision={revision}
          lastMessageAt={c.lastMessageAt}
        />
        <div className="conversation-messages" aria-label={t('messageHistory')}>
          <p className="history-caption">{t(demo ? 'sampleConversation' : 'recentMessages')}</p>
          {loading && <p className="history-caption">{t('loading')}</p>}
          {items.map((m) => (
            <div
              key={m.id}
              className={`message-row ${m.direction === 'outbound' ? 'outbound' : 'inbound'}`}
            >
              <div className="message-bubble">
                <p dir="auto">{m.type === 'text' ? m.body : t('unsupported', { type: m.type })}</p>
                <div className="message-meta">
                  <time
                    dateTime={m.timestamp}
                    title={new Intl.DateTimeFormat(locale, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(m.timestamp))}
                  >
                    {new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(
                      new Date(m.timestamp),
                    )}
                  </time>
                  {m.direction === 'outbound' && (
                    <span className={`delivery-status delivery-${m.deliveryStatus}`}>
                      {['read', 'delivered'].includes(m.deliveryStatus) ? (
                        <CheckCheck size={14} />
                      ) : m.deliveryStatus === 'sent' ? (
                        <Check size={14} />
                      ) : null}
                      {t.has(m.deliveryStatus) ? t(m.deliveryStatus) : m.deliveryStatus}
                    </span>
                  )}
                </div>
                {['uncertain', 'failed'].includes(m.deliveryStatus) && (
                  <small className="delivery-explanation">
                    {t(m.deliveryStatus === 'uncertain' ? 'uncertainHelp' : 'failedHelp')}
                  </small>
                )}
              </div>
            </div>
          ))}
          <div ref={bottom} />
        </div>
        <form className="reply-form" onSubmit={send}>
          <ErrorNotice error={error} />
          <p className="reply-from">
            {t(demo ? 'sampleReplyHint' : 'replyFrom', { number: c.displayPhone })}
          </p>
          {!editable || !windowOpen ? (
            <p className="reply-unavailable">{t(!editable ? 'viewerHint' : 'windowClosed')}</p>
          ) : (
            <div className="reply-input">
              <textarea
                aria-label={t('writeReply')}
                placeholder={t('writeReply')}
                rows={2}
                maxLength={4096}
                value={draft}
                disabled={sending}
                onChange={(e) => setDraft(e.target.value)}
              />
              <Button type="submit" disabled={sending || !draft.trim()}>
                <Send size={16} />
                {t(sending ? 'sending' : demo ? 'tryReply' : 'send')}
              </Button>
            </div>
          )}
        </form>
      </section>
      <aside className={`customer-pane ${details ? 'is-open' : ''}`}>
        <div className="customer-heading">
          <h2>{t('customerDetails')}</h2>
          <button
            className="icon-button customer-toggle"
            aria-label={t('close')}
            onClick={() => setDetails(false)}
          >
            <X size={18} />
          </button>
        </div>
        <CustomerForm
          key={c.id}
          conversation={c}
          demo={demo}
          editable={editable}
          url={url}
          onUpdate={onUpdate}
        />
      </aside>
    </>
  );
}
function CustomerForm({
  conversation: c,
  demo,
  editable,
  url,
  onUpdate,
}: {
  conversation: Conversation;
  demo: boolean;
  editable: boolean;
  url: string;
  onUpdate: (fields: Partial<Conversation>) => void;
}) {
  const t = useTranslations('crm');
  const [fields, setFields] = useState<CustomerFields>({
    name: c.name,
    service: c.service,
    destination: c.destination,
    inquiryStatus: c.inquiryStatus,
    note: c.note,
  });
  const [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [error, setError] = useState('');
  function edit<K extends keyof CustomerFields>(key: K, value: CustomerFields[K]) {
    setFields({ ...fields, [key]: value });
    setSaved(false);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (!demo) await api(url, { method: 'PATCH', body: JSON.stringify(fields) });
      onUpdate(fields);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'serverError');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="customer-form" onSubmit={save}>
      <p className="customer-caption">{t('detailsHint')}</p>
      <fieldset disabled={!editable || busy}>
        <label>
          {t('customerName')}
          <input
            required
            maxLength={120}
            value={fields.name}
            onChange={(e) => edit('name', e.target.value)}
          />
        </label>
        <label>
          {t('service')}
          <select
            value={fields.service}
            onChange={(e) => edit('service', e.target.value as CustomerFields['service'])}
          >
            {services.map((s) => (
              <option key={s} value={s}>
                {t(s)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('destination')}
          <input
            value={fields.destination}
            maxLength={160}
            placeholder={t('destinationPlaceholder')}
            onChange={(e) => edit('destination', e.target.value)}
          />
        </label>
        <label>
          {t('inquiryStatus')}
          <select
            value={fields.inquiryStatus}
            onChange={(e) =>
              edit('inquiryStatus', e.target.value as CustomerFields['inquiryStatus'])
            }
          >
            {inquiryStatuses.map((s) => (
              <option key={s} value={s}>
                {t(s)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('privateNote')}
          <textarea
            value={fields.note}
            maxLength={2000}
            rows={4}
            placeholder={t('notePlaceholder')}
            onChange={(e) => edit('note', e.target.value)}
          />
        </label>
        <p className="note-help">{t('noteHint')}</p>
        {editable && (
          <Button type="submit" variant="outline">
            {saved ? <Check size={15} /> : null}
            {t(busy ? 'saving' : saved ? 'saved' : 'saveDetails')}
          </Button>
        )}
      </fieldset>
      <ErrorNotice error={error} />
      <span className="sr-only" role="status">
        {saved ? t('saved') : ''}
      </span>
    </form>
  );
}
