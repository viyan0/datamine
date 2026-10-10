'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Building2, MessageCircle, Send, Tags, Users } from 'lucide-react';
import type { WorkspaceData } from '@/lib/workspace';
import { useNumber } from './dashboard-charts';

export function AdminOverview({ data, root }: { data: WorkspaceData; root: string }) {
  const t = useTranslations('platformMetrics'),
    number = useNumber();
  const stats = data.platformOverview;
  const businesses = stats?.offersByBusiness ?? [];
  const largest = Math.max(1, ...businesses.map((b) => b.count));
  const metrics = [
    { label: t('businesses'), count: data.agencies.length, icon: Building2, href: 'agencies' },
    { label: t('activeOffers'), count: stats?.activeOffers ?? 0, icon: Tags, href: 'offers' },
    {
      label: t('enrolledCustomers'),
      count: stats?.enrolledCustomers ?? 0,
      icon: Users,
      href: 'customers',
    },
    { label: t('sentOffers'), count: stats?.sentOffers ?? 0, icon: Send, href: 'campaigns' },
  ];
  return (
    <div className="admin-overview">
      <section className="admin-metrics">
        {metrics.map(({ label, count, icon: Icon, href }) => (
          <Link className="panel admin-metric" href={`${root}/${href}`} key={href}>
            <Icon size={22} aria-hidden="true" />
            <span>{label}</span>
            <strong>{number.format(count)}</strong>
          </Link>
        ))}
      </section>
      <div className="admin-overview-grid">
        <section className="panel admin-offer-chart">
          <h2>{t('offersByBusiness')}</h2>
          {businesses.map((b) => (
            <div className="admin-chart-row" key={b.id}>
              <span>{b.name}</span>
              <strong>{number.format(b.count)}</strong>
              <div className="admin-chart-track" aria-hidden="true">
                <i style={{ width: `${(b.count / largest) * 100}%` }} />
              </div>
            </div>
          ))}
          <Link className="btn btn-outline" href={`${root}/agencies`}>
            {t('manageBusinesses')}
          </Link>
        </section>
        <section className="panel admin-central">
          <MessageCircle size={24} aria-hidden="true" />
          <h2>{t('centralNumber')}</h2>
          <p>{data.centralWhatsapp?.label ?? 'Datamine'}</p>
          {data.centralWhatsapp && <strong dir="ltr">{data.centralWhatsapp.displayPhone}</strong>}
          <Link className="btn btn-outline" href={`${root}/connections`}>
            WhatsApp
          </Link>
        </section>
      </div>
    </div>
  );
}
