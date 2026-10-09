'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  ArrowUpRight,
  Building2,
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
  Tags,
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
import { Brand } from './brand';
import { Button } from './ui/button';
import { LanguageSwitch } from './language-switch';
import { WorkspaceForm, type FormKind } from './workspace-form';
import { Dialog } from './dialog';
import { authClient } from '@/lib/auth-client';
import { CustomerDirectory } from './customer-directory';
import { BusinessSettings } from './business-settings';
import { Campaigns } from './campaigns';
import { Products } from './products';
import { CentralWhatsapp } from './central-whatsapp';
import { AgencyInbox } from './inbox';
import { DashboardCharts } from './dashboard-charts';

const languageNames: Record<string, string> = { en: 'English', ar: 'العربية', ckb: 'کوردی' };
const navGroups = [
  {
    label: 'workspace',
    items: [
      { key: 'overview', icon: LayoutGrid },
      { key: 'inbox', icon: Inbox },
      { key: 'customers', icon: Users },
      { key: 'offers', label: 'catalogTitle', icon: Tags },
      { key: 'campaigns', icon: Megaphone },
    ],
  },
  {
    label: 'manage',
    items: [
      { key: 'agencies', icon: Building2 },
      { key: 'connections', icon: MessageCircle },
      { key: 'settings', icon: Settings2 },
    ],
  },
];
const pageSubtitles: Record<string, string> = {
  overview: 'welcomeSub',
  inbox: 'inboxSub',
  customers: 'customersSub',
  offers: 'offersSub',
  campaigns: 'campaignsSub',
  agencies: 'agenciesSub',
  team: 'teamSub',
  connections: 'connectionSub',
  settings: 'settingsSub',
};
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
    [formAgencyId, setFormAgencyId] = useState<string>(),
    [query, setQuery] = useState(''),
    [notice, setNotice] = useState('');
  const root = `/${locale}/${demo ? 'demo' : 'app'}`;
  const manage = data.agencies.some((a) => ['owner', 'admin'].includes(a.role));
  const totalPeople = new Set(data.members.map((m) => m.email)).size;
  function open(kind: FormKind, agencyId?: string) {
    if (demo) setNotice(t('demoReadOnly'));
    else {
      setFormAgencyId(agencyId);
      setForm(kind);
    }
  }
  function date(value: string) {
    return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(
      new Date(value),
    );
  }
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
              {section === 'agencies' && data.user.platformAdmin && <th>{t('businessLogin')}</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((a, i) => {
              const count = data.centralWhatsapp
                ? 1
                : data.connections.filter((c) => c.agencyId === a.id).length;
              return (
                <tr key={a.id}>
                  <td>
                    <div className="identity">
                      <Avatar name={a.name} index={i} />
                      <span>
                        <strong>{a.name}</strong>
                        <small>{a.industry}</small>
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
                  {section === 'agencies' && data.user.platformAdmin && (
                    <td>
                      <Button variant="outline" onClick={() => open('business-access', a.id)}>
                        <LockKeyhole size={14} />
                        {t('businessLogin')}
                      </Button>
                    </td>
                  )}
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
        <nav aria-label={t('workspace')}>
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p className="nav-label">{t(group.label)}</p>
              {group.items.map(({ key, label, icon: Icon }) => (
                <Link
                  key={key}
                  href={`${root}${key === 'overview' ? '' : `/${key}`}`}
                  className={`nav-item ${section === key ? 'selected' : ''}`}
                  aria-current={section === key ? 'page' : undefined}
                  onClick={() => setMenu(false)}
                >
                  <span className="nav-icon">
                    <Icon size={18} />
                  </span>
                  <span>{t(label || key)}</span>
                  {key === 'agencies' && <span className="nav-count">{data.agencies.length}</span>}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
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
            <ChevronRight size={14} className="directional" />
            <b>{t(section === 'offers' ? 'catalogTitle' : section)}</b>
          </div>
          <div className="topbar-right">
            {demo && (
              <>
                <span className="demo-banner" title={t('demoNotice')}>
                  <Sparkles size={14} />
                  <span>{t('demoNotice')}</span>
                </span>
                <Link className="btn btn-outline topbar-signin" href={`/${locale}`}>
                  {t('signIn')}
                  <ArrowUpRight size={14} />
                </Link>
              </>
            )}
            <LanguageSwitch />
          </div>
        </header>
        <main
          className={`dashboard-content ${section === 'inbox' ? 'inbox-content' : section === 'overview' ? 'overview-content' : ''}`}
        >
          <div className="page-heading">
            <div>
              <h1>{t(section === 'offers' ? 'catalogTitle' : section)}</h1>
              <p>{t(pageSubtitles[section])}</p>
            </div>
            {section === 'overview' ? (
              <Link className="btn btn-primary" href={`${root}/inbox`}>
                {t('explore')}
                <ArrowUpRight size={16} />
              </Link>
            ) : section === 'agencies' ? (
              data.user.platformAdmin && (
                <Button onClick={() => open('agency')}>
                  <Plus size={17} />
                  {t('newAgency')}
                </Button>
              )
            ) : section === 'team' ? (
              manage && (
                <Button onClick={() => open('invite')}>
                  <Plus size={17} />
                  {t('inviteMember')}
                </Button>
              )
            ) : section === 'connections' ? (
              data.user.platformAdmin && (
                <Button onClick={() => open('connection')}>
                  <Plus size={17} />
                  {t('connectNumber')}
                </Button>
              )
            ) : null}
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
          {section === 'offers' && <Products data={data} demo={demo} />}
          {section === 'campaigns' && <Campaigns data={data} demo={demo} />}
          {section === 'customers' && <CustomerDirectory demo={demo} />}
          {section === 'inbox' && <AgencyInbox data={data} demo={demo} />}
          {section === 'overview' && (
            <>
              {data.analytics && (
                <DashboardCharts analytics={data.analytics} businessCount={data.agencies.length} />
              )}
              <section className="panel agency-panel overview-businesses">
                <div className="panel-heading">
                  <h2>{t('agencies')}</h2>
                  <Link className="text-link" href={`${root}/agencies`}>
                    {t('viewAll')}
                    <ArrowUpRight size={14} />
                  </Link>
                </div>
                {agencyTable(data.agencies.slice(0, 4))}
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
            <div className="page-stack">
              <div className="connections-overview">
                <CentralWhatsapp data={data} demo={demo} />
                <WebhookPanel demo={demo} admin={data.user.platformAdmin} />
              </div>
              {data.user.platformAdmin && data.connections.length > 0 && (
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
              {data.user.platformAdmin && !data.connections.length && (
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
              {!demo && data.user.platformAdmin && data.agencies.length > 0 && (
                <MessagePanel data={data} />
              )}
            </div>
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
              </section>
              <BusinessSettings data={data} demo={demo} />
              <PasswordPanel demo={demo} />
            </div>
          )}
        </main>
      </div>
      {form && (
        <WorkspaceForm
          kind={form}
          data={data}
          agencyId={formAgencyId}
          close={() => setForm(null)}
        />
      )}
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
