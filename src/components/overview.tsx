'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowDown, ArrowUp, ArrowUpRight, Building2, ChevronRight, Users } from 'lucide-react';
import type { WorkspaceData } from '@/lib/workspace';
import { ActivityCard, StatusBars, statusKeys, useNumber } from './dashboard-charts';
import { Avatar } from './ui/avatar';
import { Empty } from './ui/empty';

const languageNames: Record<string, string> = { en: 'English', ar: 'العربية', ckb: 'کوردی' };
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

export function OverviewPage({ data, root }: { data: WorkspaceData; root: string }) {
  const t = useTranslations(),
    d = useTranslations('dashboard'),
    crm = useTranslations('crm'),
    number = useNumber();
  const [period, setPeriod] = useState(7);
  const all = data.analytics?.daily ?? [];
  const daily = all.slice(-period);
  const counts = data.analytics?.conversations ?? { new: 0, inProgress: 0, closed: 0 };
  const received = sum(daily.map((day) => day.received));
  const sent = sum(daily.map((day) => day.sent));
  // A 7-day view can be compared with the 7 days before it; the 30-day view has no earlier data.
  const previous =
    period * 2 <= all.length ? sum(all.slice(-period * 2, -period).map((day) => day.received)) : 0;
  const change = previous ? Math.round(((received - previous) / previous) * 100) : null;
  const open = counts.new + counts.inProgress;
  const total = counts.new + counts.inProgress + counts.closed;
  const share = (value: number) => (total ? Math.round((value / total) * 100) : 0);
  const members = (id: string) => data.members.filter((m) => m.agencyId === id).length;
  const connected = (id: string) =>
    !!data.centralWhatsapp || data.connections.some((c) => c.agencyId === id);
  const [featured, ...others] = data.agencies;

  return (
    <>
      <section className="ov-top">
        <div className="ov-hero">
          <p className="ov-hero-label">{d('received')}</p>
          <div className="ov-hero-figure">
            <strong className="figure">{number.format(received)}</strong>
            {change !== null && (
              <span className={`chip ${change >= 0 ? 'chip-accent' : 'chip-dark'}`}>
                {change >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                {number.format(Math.abs(change))}%
              </span>
            )}
            <span className="chip chip-soft">
              {number.format(sent)} {d('sent')}
            </span>
          </div>
          <p className="ov-muted">{d('lastDays', { count: period })}</p>
        </div>
        <div className="ov-kpis">
          <Link className="ov-kpi ov-kpi-dark" href={`${root}/inbox`}>
            <span>{d('openChats')}</span>
            <strong>{number.format(open)}</strong>
            <small>{d('current')}</small>
            <i aria-hidden="true">
              <ChevronRight size={14} className="directional" />
            </i>
          </Link>
          <Link className="ov-kpi" href={`${root}/settings`}>
            <span>{d('businesses')}</span>
            <strong>{number.format(data.agencies.length)}</strong>
            <small>{d('total')}</small>
            <i aria-hidden="true">
              <ChevronRight size={14} className="directional" />
            </i>
          </Link>
          {statusKeys.map((key) => (
            <div className={`ov-kpi ov-kpi-small ${key === 'new' ? 'is-accent' : ''}`} key={key}>
              <span>{crm(key)}</span>
              <b className="ov-kpi-pill">{number.format(counts[key])}</b>
              <small>{number.format(share(counts[key]))}%</small>
            </div>
          ))}
        </div>
      </section>

      <section className="ov-share" aria-label={d('conversations')}>
        <div className="ov-share-track">
          {statusKeys.map((key) => (
            <div
              key={key}
              className="ov-share-segment"
              style={{ flexGrow: Math.max(counts[key], total ? 0.6 : 1) }}
            >
              <i className={`ov-dot ov-dot-${key}`} aria-hidden="true" />
              <b>{number.format(counts[key])}</b>
              <span>{crm(key)}</span>
              <small>{number.format(share(counts[key]))}%</small>
            </div>
          ))}
        </div>
        <Link className="btn btn-primary ov-share-action" href={`${root}/inbox`}>
          {t('viewAll')}
        </Link>
      </section>

      <div className="ov-grid">
        <div className="ov-pair">
          <section className="well ov-list" aria-label={t('agencies')}>
            <header>
              <Building2 size={18} />
              <Link className="ov-filter" href={`${root}/settings`}>
                {t('viewAll')}
                <ArrowUpRight size={14} />
              </Link>
            </header>
            <div className="row-list">
              {data.agencies.slice(0, 4).map((a, i) => (
                <div className="row" key={a.id}>
                  <Avatar name={a.name} index={i} />
                  <span className="ov-list-name">{a.name}</span>
                  <b className="ov-list-value">{number.format(members(a.id))}</b>
                  <span className="chip">
                    <Users size={12} />
                    {t('members')}
                  </span>
                </div>
              ))}
              {!data.agencies.length && (
                <Empty
                  icon={Building2}
                  title={t('emptyAgencies')}
                  subtitle={t('emptyAgenciesSub')}
                />
              )}
            </div>
          </section>
          <StatusBars counts={counts} />
        </div>

        <section className="ov-table" aria-label={t('agencies')}>
          <div className="ov-table-head">
            <span>{t('agency')}</span>
            <span>{t('language')}</span>
            <span>{t('members')}</span>
            <span>{t('status')}</span>
          </div>
          {featured && (
            <article className="ov-feature">
              <div className="ov-table-row">
                <span className="ov-who">
                  <Avatar name={featured.name} />
                  <b>{featured.name}</b>
                </span>
                <span>{languageNames[featured.locale]}</span>
                <span>
                  <b className="chip chip-dark">{number.format(members(featured.id))}</b>
                </span>
                <span>
                  <span
                    className={`badge ${connected(featured.id) ? 'badge-green' : 'badge-neutral'}`}
                  >
                    <i />
                    {t(connected(featured.id) ? 'active' : 'needsSetup')}
                  </span>
                </span>
              </div>
              <p className="ov-feature-title">{featured.industry}</p>
              {featured.categories.length > 0 && (
                <div className="ov-feature-chips">
                  {featured.categories.map((category) => (
                    <span className="chip chip-outline" key={category}>
                      {crm.has(category) ? crm(category) : category}
                    </span>
                  ))}
                </div>
              )}
            </article>
          )}
          {others.map((a, i) => (
            <div className="ov-table-row ov-plain" key={a.id}>
              <span className="ov-who">
                <Avatar name={a.name} index={i + 1} />
                <b>{a.name}</b>
              </span>
              <span>{languageNames[a.locale]}</span>
              <span>
                <b className="chip chip-dark">{number.format(members(a.id))}</b>
              </span>
              <span>
                <span className={`badge ${connected(a.id) ? 'badge-green' : 'badge-neutral'}`}>
                  <i />
                  {t(connected(a.id) ? 'active' : 'needsSetup')}
                </span>
              </span>
            </div>
          ))}
          {!featured && (
            <Empty icon={Building2} title={t('emptyAgencies')} subtitle={t('emptyAgenciesSub')} />
          )}
        </section>
        <ActivityCard daily={daily} period={period} setPeriod={setPeriod} open={open} />
      </div>
    </>
  );
}
