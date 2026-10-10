'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  ArrowUpRight,
  Building2,
  Inbox,
  LayoutGrid,
  Megaphone,
  MessageCircle,
  Plus,
  Settings2,
  Sparkles,
  Tags,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { WorkspaceData } from '@/lib/workspace';
import { authClient } from '@/lib/auth-client';
import { BrandMark, Brand } from './brand';
import { Button } from './ui/button';
import { WorkspaceForm, type FormKind } from './workspace-form';
import { AccountMenu, CreateMenu, PageSearch, type CreateAction } from './shell-menus';
import { OverviewPage } from './overview';
import { AdminOverview } from './admin-overview';
import { AgencyInbox } from './inbox';
import { CustomerDirectory } from './customer-directory';
import { Products } from './products';
import { Campaigns } from './campaigns';
import { BusinessesPage, TeamPage } from './businesses';
import { WhatsAppPage } from './whatsapp';
import { SettingsPage } from './settings';

type NavItem = { key: string; label?: string; icon: LucideIcon };
const allPrimaryNav: NavItem[] = [
  { key: 'overview', icon: LayoutGrid },
  { key: 'inbox', icon: Inbox },
  { key: 'customers', icon: Users },
  { key: 'offers', label: 'catalogTitle', icon: Tags },
  { key: 'campaigns', icon: Megaphone },
];
const allManageNav: NavItem[] = [
  { key: 'agencies', icon: Building2 },
  { key: 'connections', icon: MessageCircle },
];
const settingsNav: NavItem = { key: 'settings', icon: Settings2 };

export function Dashboard({
  data,
  section,
  demo = false,
  create,
}: {
  data: WorkspaceData;
  section: string;
  demo?: boolean;
  /** Set when the "+" menu opened this page to start creating something. */
  create?: string;
}) {
  const t = useTranslations(),
    locale = useLocale(),
    router = useRouter();
  const admin = data.user.platformAdmin;
  const primaryNav = allPrimaryNav.filter((item) => !admin || item.key !== 'inbox');
  const manageNav = allManageNav.filter((item) => admin || item.key !== 'agencies');
  const manage = data.agencies.some((a) => ['owner', 'admin'].includes(a.role));
  // Business and number forms are platform-admin actions opened from this shell.
  const requestedForm: FormKind | null =
    create && admin
      ? section === 'agencies'
        ? 'agency'
        : section === 'connections'
          ? 'connection'
          : null
      : null;
  const [form, setForm] = useState<FormKind | null>(demo ? null : requestedForm),
    [formAgencyId, setFormAgencyId] = useState<string>(),
    [notice, setNotice] = useState(demo && requestedForm ? t('demoReadOnly') : '');
  const root = `/${locale}/${demo ? 'demo' : 'app'}`;
  const href = (key: string) => `${root}${key === 'overview' ? '' : `/${key}`}`;
  const label = (item: NavItem) => t(item.label || item.key);

  useEffect(() => {
    // Drop ?create=… once handled so a reload does not reopen the dialog.
    if (create) window.history.replaceState(null, '', window.location.pathname);
  }, [create]);

  function open(kind: FormKind, agencyId?: string) {
    if (demo) setNotice(t('demoReadOnly'));
    else {
      setFormAgencyId(agencyId);
      setForm(kind);
    }
  }
  const createActions: CreateAction[] = [
    ...(manage || admin ? [{ label: t('catalog.add'), href: href('offers'), icon: Tags }] : []),
    ...(manage || admin
      ? [{ label: t('offers.newOffer'), href: href('campaigns'), icon: Megaphone }]
      : []),
    ...(admin ? [{ label: t('newAgency'), href: href('agencies'), icon: Building2 }] : []),
    ...(admin
      ? [{ label: t('connectNumber'), href: href('connections'), icon: MessageCircle }]
      : []),
  ];
  const railItem = (item: NavItem) => {
    const Icon = item.icon,
      selected = section === item.key;
    return (
      <Link
        key={item.key}
        href={href(item.key)}
        className={`rail-item ${selected ? 'selected' : ''}`}
        aria-label={label(item)}
        aria-current={selected ? 'page' : undefined}
      >
        <Icon size={20} aria-hidden="true" />
        <span className="rail-tip" aria-hidden="true">
          {label(item)}
        </span>
        {item.key === 'agencies' && data.agencies.length > 0 && (
          <span className="rail-badge" aria-hidden="true">
            {data.agencies.length}
          </span>
        )}
      </Link>
    );
  };

  return (
    <div className="app-shell">
      <aside className="rail">
        <Link href={root} className="rail-logo" aria-label="Datamine">
          <BrandMark />
        </Link>
        <nav className="rail-nav" aria-label={t('workspace')}>
          {primaryNav.map(railItem)}
          <hr className="rail-divider" />
          {manageNav.map(railItem)}
        </nav>
        <div className="rail-bottom">{railItem(settingsNav)}</div>
      </aside>
      <header className="topbar">
        <Link href={root} className="topbar-brand" aria-label="Datamine">
          <Brand />
        </Link>
        <PageSearch
          pages={[...primaryNav, ...manageNav, settingsNav].map((item) => ({
            label: label(item),
            href: href(item.key),
          }))}
        />
        <div className="topbar-actions">
          {demo && (
            <span className="chip chip-outline demo-chip" title={t('demoNotice')}>
              <Sparkles size={14} />
              <span>{t('demoNotice')}</span>
            </span>
          )}
          <AccountMenu
            user={data.user}
            demo={demo}
            signInHref={`/${locale}`}
            onSignOut={async () => {
              await authClient.signOut();
              router.push(`/${locale}`);
              router.refresh();
            }}
          />
          {createActions.length > 0 && <CreateMenu actions={createActions} />}
        </div>
      </header>
      <main className={`dashboard-content content-${section}`}>
        <div className="page-heading">
          <div>
            <h1>
              {t(
                section === 'overview'
                  ? admin
                    ? 'adminDashboard'
                    : 'businessDashboard'
                  : section === 'offers'
                    ? 'catalogTitle'
                    : section,
              )}
            </h1>
            {section === 'overview' && (
              <p>{t(admin ? 'adminOverviewSub' : 'businessOverviewSub')}</p>
            )}
          </div>
          {section === 'overview' ? (
            <Link className="btn btn-primary" href={href(admin ? 'agencies' : 'inbox')}>
              {t(admin ? 'platformMetrics.manageBusinesses' : 'explore')}
              <ArrowUpRight size={16} />
            </Link>
          ) : section === 'agencies' ? (
            admin && (
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
            admin && (
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
        {section === 'overview' &&
          (admin ? (
            <AdminOverview data={data} root={root} />
          ) : (
            <OverviewPage data={data} root={root} />
          ))}
        {section === 'inbox' && !admin && <AgencyInbox data={data} demo={demo} />}
        {section === 'customers' && <CustomerDirectory demo={demo} />}
        {section === 'offers' && <Products data={data} demo={demo} startCreating={!!create} />}
        {section === 'campaigns' && <Campaigns data={data} demo={demo} startCreating={!!create} />}
        {section === 'agencies' && <BusinessesPage data={data} openForm={open} />}
        {section === 'team' && <TeamPage data={data} />}
        {section === 'connections' && (
          <WhatsAppPage data={data} demo={demo} manage={manage} openForm={open} />
        )}
        {section === 'settings' && <SettingsPage data={data} demo={demo} />}
        {form && (
          <WorkspaceForm
            kind={form}
            data={data}
            agencyId={formAgencyId}
            close={() => setForm(null)}
          />
        )}
      </main>
    </div>
  );
}
