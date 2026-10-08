'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  ChevronRight,
  Copy,
  Globe2,
  Inbox,
  LayoutGrid,
  LockKeyhole,
  LogOut,
  Megaphone,
  Menu,
  MessageCircle,
  Plus,
  Radio,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  RefreshCw,
} from 'lucide-react';
import type { WorkspaceData } from '@/lib/workspace';
import { Brand, JourneyArt } from './brand';
import { Button } from './ui/button';
import { LanguageSwitch } from './language-switch';
import { WorkspaceForm, type FormKind } from './workspace-form';
import { Dialog } from './dialog';
import { authClient } from '@/lib/auth-client';

const languageNames: Record<string, string> = { en: 'English', ar: 'العربية', ckb: 'کوردی' };
const nav = [
  { key: 'overview', icon: LayoutGrid },
  { key: 'agencies', icon: Building2 },
  { key: 'team', icon: Users },
  { key: 'connections', icon: MessageCircle },
  { key: 'settings', icon: Settings2 },
];
function Avatar({ name, index = 0 }: { name: string; index?: number }) {
  return (
    <span className={`avatar avatar-${index % 4}`}>
      {name
        .split(' ')
        .slice(0, 2)
        .map((v) => v[0])
        .join('')}
    </span>
  );
}
export function Dashboard({
  data,
  section,
  demo = false,
}: {
  data: WorkspaceData;
  section: string;
  demo?: boolean;
}) {
  const t = useTranslations(),
    locale = useLocale(),
    router = useRouter();
  const [menu, setMenu] = useState(false),
    [form, setForm] = useState<FormKind | null>(null),
    [query, setQuery] = useState(''),
    [notice, setNotice] = useState('');
  const root = `/${locale}/${demo ? 'demo' : 'app'}`;
  const manage = data.agencies.some((a) => ['owner', 'admin'].includes(a.role));
  const totalPeople = new Set(data.members.map((m) => m.email)).size;
  const completed = [
    data.agencies.length > 0,
    totalPeople > 1,
    data.connections.length > 0,
    data.messageCount > 0,
  ];
  const done = completed.filter(Boolean).length;
  function open(kind: FormKind) {
    if (demo) setNotice(t('demoReadOnly'));
    else setForm(kind);
  }
  function date(value: string) {
    return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(
      new Date(value),
    );
  }
  const headerKeys: Record<string, [string, string]> = {
    overview: ['welcome', 'welcomeSub'],
    agencies: ['agenciesTitle', 'agenciesSub'],
    team: ['teamTitle', 'teamSub'],
    connections: ['connectionTitle', 'connectionSub'],
    settings: ['settingsTitle', 'settingsSub'],
  };
  const currentHeader = headerKeys[section];
  function agencyTable(items: WorkspaceData['agencies']) {
    return items.length ? (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t('agency')}</th>
              <th>{t('language')}</th>
              <th>{t('members')}</th>
              <th>{t('status')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a, i) => {
              const count = data.connections.filter((c) => c.agencyId === a.id).length;
              return (
                <tr key={a.id}>
                  <td>
                    <div className="identity">
                      <Avatar name={a.name} index={i} />
                      <span>
                        <strong>{a.name}</strong>
                        <small>{a.slug}</small>
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className="language-cell">
                      <Globe2 size={13} />
                      {languageNames[a.locale]}
                    </span>
                  </td>
                  <td>
                    <span className="member-count">
                      <Users size={14} />
                      {data.members.filter((m) => m.agencyId === a.id).length}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${count ? 'badge-green' : 'badge-neutral'}`}>
                      <i />
                      {t(count ? 'active' : 'needsSetup')}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    ) : (
      <Empty
        icon={Building2}
        title={t(query ? 'noResults' : 'emptyAgencies')}
        subtitle={t('emptyAgenciesSub')}
      />
    );
  }
  return (
    <div className="app-shell">
      {menu && (
        <button className="sidebar-scrim" aria-label={t('close')} onClick={() => setMenu(false)} />
      )}
      <aside className={`sidebar ${menu ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-button mobile-only"
            aria-label={t('close')}
            onClick={() => setMenu(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="workspace-switch">
          <span className="workspace-icon">
            <Globe2 size={19} />
          </span>
          <div>
            <strong>Datamine</strong>
            <small>{t(demo ? 'demo' : 'liveWorkspace')}</small>
          </div>
          <ChevronRight size={15} />
        </div>
        <p className="nav-label">{t('workspace')}</p>
        <nav aria-label={t('workspace')}>
          {nav.map(({ key, icon: Icon }) => (
            <Link
              key={key}
              href={`${root}${key === 'overview' ? '' : `/${key}`}`}
              className={`nav-item ${section === key ? 'selected' : ''}`}
              aria-current={section === key ? 'page' : undefined}
              onClick={() => setMenu(false)}
            >
              <Icon size={18} />
              <span>{t(key)}</span>
              {key === 'agencies' && <span className="nav-count">{data.agencies.length}</span>}
            </Link>
          ))}
        </nav>
        <p className="nav-label future-label">{t('comingNext')}</p>
        <div className="future-nav">
          {[
            { key: 'inbox', icon: Inbox },
            { key: 'intelligence', icon: Sparkles },
            { key: 'campaigns', icon: Megaphone },
          ].map(({ key, icon: Icon }) => (
            <div key={key}>
              <Icon size={17} />
              <span>{t(key)}</span>
              <LockKeyhole size={12} />
            </div>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="phase-card">
            <span className="phase-dot" />
            <strong>{t('phaseOne')}</strong>
            <p>{t('phaseCaption')}</p>
            <div className="phase-track">
              <span />
            </div>
          </div>
          <div className="user-card">
            <Avatar name={data.user.name} />
            <div>
              <strong>{data.user.name}</strong>
              <small>{demo ? t('demo') : data.user.email}</small>
            </div>
            {!demo && (
              <button
                className="icon-button"
                aria-label={t('signOut')}
                onClick={async () => {
                  await authClient.signOut();
                  router.push(`/${locale}`);
                  router.refresh();
                }}
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-only"
              aria-label={t('workspace')}
              onClick={() => setMenu(true)}
            >
              <Menu size={20} />
            </button>
            <span>{t('workspace')}</span>
            <ChevronRight size={13} />
            <b>{t(section)}</b>
          </div>
          <div className="topbar-right">
            <span className="pilot-tag">
              <span className="small-dot" />
              {t('phaseOne')}
            </span>
            <LanguageSwitch />
          </div>
        </header>
        {demo && (
          <div className="demo-banner">
            <span>
              <Sparkles size={14} />
              {t('demoNotice')}
            </span>
            <Link href={`/${locale}`}>
              {t('signIn')}
              <ArrowUpRight size={14} />
            </Link>
          </div>
        )}
        <main className="dashboard-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">{t('today')}</p>
              <h1>{t(currentHeader[0])}</h1>
              <p>{t(currentHeader[1])}</p>
            </div>
            {section === 'overview' || section === 'agencies'
              ? data.user.platformAdmin && (
                  <Button onClick={() => open('agency')}>
                    <Plus size={17} />
                    {t('newAgency')}
                  </Button>
                )
              : section === 'team'
                ? manage && (
                    <Button onClick={() => open('invite')}>
                      <Plus size={17} />
                      {t('inviteMember')}
                    </Button>
                  )
                : section === 'connections'
                  ? manage && (
                      <Button onClick={() => open('connection')}>
                        <Plus size={17} />
                        {t('connectNumber')}
                      </Button>
                    )
                  : null}
          </div>
          {notice && (
            <div className="notice" role="status">
              <span>{notice}</span>
              <Link href={`/${locale}`}>{t('signIn')}</Link>
              <button className="icon-button" aria-label={t('close')} onClick={() => setNotice('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {section === 'overview' && (
            <>
              <div className="stats-grid">
                {[
                  {
                    label: 'agenciesMetric',
                    hint: 'agenciesHint',
                    value: data.agencies.length,
                    icon: Building2,
                    color: 'mint',
                  },
                  {
                    label: 'membersMetric',
                    hint: 'membersHint',
                    value: totalPeople,
                    icon: Users,
                    color: 'lavender',
                  },
                  {
                    label: 'connectionsMetric',
                    hint: 'connectionsHint',
                    value: data.connections.length,
                    icon: MessageCircle,
                    color: 'peach',
                  },
                  {
                    label: 'messagesMetric',
                    hint: 'messagesHint',
                    value: data.messageCount,
                    icon: ArrowDownLeft,
                    color: 'blue',
                  },
                ].map(({ label, hint, value, icon: Icon, color }) => (
                  <article className="stat-card" key={label}>
                    <div>
                      <span>{t(label)}</span>
                      <span className={`stat-icon ${color}`}>
                        <Icon size={18} />
                      </span>
                    </div>
                    <strong>
                      {new Intl.NumberFormat(locale, { minimumIntegerDigits: 2 }).format(value)}
                    </strong>
                    <small>{t(hint)}</small>
                  </article>
                ))}
              </div>
              <section className="setup-card">
                <div className="setup-heading">
                  <div>
                    <span className="eyebrow">{t('getStarted')}</span>
                    <h2>{t('setupTitle')}</h2>
                    <p>{t('setupSub')}</p>
                  </div>
                  <div
                    className="completion-ring"
                    style={{ '--progress': `${done * 25}%` } as React.CSSProperties}
                  >
                    <span>{done}/4</span>
                  </div>
                </div>
                <div className="setup-steps">
                  {['One', 'Two', 'Three', 'Four'].map((n, i) => (
                    <button
                      key={n}
                      className={`setup-step ${completed[i] ? 'complete' : ''}`}
                      onClick={() =>
                        i === 0
                          ? open('agency')
                          : i === 1
                            ? open('invite')
                            : router.push(`${root}/connections`)
                      }
                      disabled={
                        !demo && ((i === 0 && !data.user.platformAdmin) || (i === 1 && !manage))
                      }
                    >
                      <span className="step-marker">
                        {completed[i] ? <Check size={15} /> : `0${i + 1}`}
                      </span>
                      <span>
                        <strong>{t(`step${n}`)}</strong>
                        <small>{t(`step${n}Sub`)}</small>
                      </span>
                      <ChevronRight size={15} className="step-arrow" />
                    </button>
                  ))}
                </div>
              </section>
              <div className="overview-grid">
                <section className="panel agency-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>{t('networkTitle')}</h2>
                      <p>{t('networkSub')}</p>
                    </div>
                    <Link className="text-link" href={`${root}/agencies`}>
                      {t('viewAll')}
                      <ArrowUpRight size={14} />
                    </Link>
                  </div>
                  {agencyTable(data.agencies.slice(0, 4))}
                </section>
                <section className="panel activity-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>{t('activityTitle')}</h2>
                      <p>{t('activitySub')}</p>
                    </div>
                    <span className="activity-live" />
                  </div>
                  {data.activity.length ? (
                    <div className="activity-list">
                      {data.activity.map((a, i) => (
                        <div className="activity-item" key={a.id}>
                          <span className={`activity-icon avatar-${i % 4}`}>
                            {a.action === 'connectionAdded' ? (
                              <MessageCircle size={15} />
                            ) : a.action === 'agencyCreated' ? (
                              <Building2 size={15} />
                            ) : (
                              <Users size={15} />
                            )}
                          </span>
                          <div>
                            <strong>{t(t.has(a.action) ? a.action : 'unknownActivity')}</strong>
                            <small>{a.agencyName}</small>
                          </div>
                          <time>{date(a.createdAt)}</time>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Empty icon={Radio} title={t('noActivity')} subtitle={t('noActivitySub')} />
                  )}
                </section>
              </div>
              <section className="next-banner">
                <div>
                  <span className="eyebrow">{t('networkLabel')}</span>
                  <h2>{t('nextTitle')}</h2>
                  <p>{t('nextText')}</p>
                  <Link href={`${root}/connections`}>
                    {t('explore')}
                    <ArrowRight size={15} className="directional" />
                  </Link>
                </div>
                <JourneyArt compact />
              </section>
            </>
          )}
          {section === 'agencies' && (
            <>
              <div className="toolbar">
                <span>{t('agencyCount', { count: data.agencies.length })}</span>
                <label className="search-field">
                  <Search size={17} />
                  <input
                    aria-label={t('searchAgencies')}
                    placeholder={t('searchAgencies')}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
              <section className="panel">
                {agencyTable(
                  data.agencies.filter((a) =>
                    `${a.name} ${a.slug}`.toLowerCase().includes(query.toLowerCase()),
                  ),
                )}
              </section>
              <div className="notice subtle">
                <ShieldCheck size={20} />
                <p>{t('securityText')}</p>
              </div>
            </>
          )}
          {section === 'team' && (
            <>
              <div className="toolbar">
                <span>{t('allPeople', { count: totalPeople })}</span>
              </div>
              <section className="panel table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t('person')}</th>
                      <th>{t('agency')}</th>
                      <th>{t('role')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.members.map((m, i) => (
                      <tr key={m.id}>
                        <td>
                          <div className="identity">
                            <Avatar name={m.name} index={i} />
                            <span>
                              <strong>{m.name}</strong>
                              <small dir="ltr">{m.email}</small>
                            </span>
                          </div>
                        </td>
                        <td>{m.agencyName}</td>
                        <td>
                          <span
                            className={`badge ${m.role === 'owner' || m.role === 'admin' ? 'badge-green' : 'badge-neutral'}`}
                          >
                            {t(m.role)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.members.length && <Empty icon={Users} title={t('noMembers')} />}
              </section>
              <div className="notice subtle">
                <ShieldCheck size={20} />
                <p>{t('roleHelp')}</p>
              </div>
            </>
          )}
          {section === 'connections' && (
            <>
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
              {!data.connections.length && (
                <section className="panel">
                  <Empty
                    icon={MessageCircle}
                    title={t('noConnections')}
                    subtitle={t('noConnectionsSub')}
                  >
                    {manage && (
                      <Button onClick={() => open('connection')}>
                        <Plus size={16} />
                        {t('connectNumber')}
                      </Button>
                    )}
                  </Empty>
                </section>
              )}
              <div className="notice subtle">
                <ShieldCheck size={20} />
                <p>{t('connectionNote')}</p>
              </div>
              <WebhookPanel demo={demo} admin={data.user.platformAdmin} />
              {!demo && data.agencies.length > 0 && <MessagePanel data={data} />}
            </>
          )}
          {section === 'settings' && (
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
                <p>{t('languageHelp')}</p>
                <LanguageSwitch />
              </section>
              <section className="panel settings-card">
                <span className="settings-icon">
                  <ShieldCheck />
                </span>
                <h2>{t('securityTitle')}</h2>
                <p>{t('securityText')}</p>
                <hr />
                <h3>{t('phaseScope')}</h3>
                <p>{t('scopeText')}</p>
              </section>
              <PasswordPanel demo={demo} />
            </div>
          )}
          <footer className="workspace-footer">
            <span>
              Datamine <span>✦</span> {t('brandTag')}
            </span>
            <span>{t('phaseOne')}</span>
          </footer>
        </main>
      </div>
      {form && <WorkspaceForm kind={form} data={data} close={() => setForm(null)} />}
    </div>
  );
}
function Empty({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof Building2;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <span>
        <Icon size={25} />
      </span>
      <h3>{title}</h3>
      {subtitle && <p>{subtitle}</p>}
      {children}
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
    <section className="panel webhook-panel">
      <div>
        <span className="stat-icon lavender">
          <Radio size={20} />
        </span>
        <h2>{t('webhookTitle')}</h2>
        <p>{t('webhookHelp')}</p>
      </div>
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
type ReceivedMessage = {
  id: string;
  type: string;
  body: string | null;
  contactPhone: string;
  receivedAt: string;
};
function MessagePanel({ data }: { data: WorkspaceData }) {
  const t = useTranslations(),
    [agency, setAgency] = useState(data.agencies[0]?.id || ''),
    [items, setItems] = useState<ReceivedMessage[] | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function load() {
    setBusy(true);
    setError('');
    try {
      const r = await fetch(`/api/agencies/${agency}/messages`);
      if (!r.ok) throw new Error();
      setItems((await r.json()).messages);
    } catch {
      setError(t('errors.serverError'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel messages-panel">
      <div className="panel-heading">
        <h2>{t('receivedMessages')}</h2>
        <div className="message-controls">
          <select
            aria-label={t('agency')}
            value={agency}
            onChange={(e) => {
              setAgency(e.target.value);
              setItems(null);
            }}
          >
            {data.agencies.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <Button variant="outline" disabled={busy} onClick={load}>
            <RefreshCw size={14} />
            {t(busy ? 'loading' : 'showMessages')}
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {items && (
        <Dialog title={t('receivedMessages')} close={() => setItems(null)}>
          <div className="modal-body message-list">
            {items.length ? (
              items.map((m) => (
                <article key={m.id}>
                  <header>
                    <strong dir="ltr">{m.contactPhone}</strong>
                    <time>{new Date(m.receivedAt).toLocaleString()}</time>
                  </header>
                  <p dir="auto">
                    {m.type === 'text' ? m.body : t('unsupportedMedia', { type: m.type })}
                  </p>
                </article>
              ))
            ) : (
              <Empty icon={MessageCircle} title={t('noMessages')} />
            )}
          </div>
        </Dialog>
      )}
    </section>
  );
}
