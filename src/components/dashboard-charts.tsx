'use client';

import { useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowDownLeft, ArrowUpRight, Building2, MessageCircle } from 'lucide-react';
import type { DashboardAnalytics, DailyActivity } from '@/lib/dashboard-analytics';

export function DashboardCharts({
  analytics,
  businessCount,
}: {
  analytics: DashboardAnalytics;
  businessCount: number;
}) {
  const t = useTranslations('dashboard'),
    locale = useLocale();
  const [period, setPeriod] = useState(7);
  const daily = analytics.daily.slice(-period);
  const received = daily.reduce((total, day) => total + day.received, 0);
  const sent = daily.reduce((total, day) => total + day.sent, 0);
  const open = analytics.conversations.new + analytics.conversations.inProgress;
  const number = new Intl.NumberFormat(locale);
  const stats = [
    {
      label: 'received',
      value: received,
      icon: ArrowDownLeft,
      hint: t('lastDays', { count: period }),
    },
    { label: 'sent', value: sent, icon: ArrowUpRight, hint: t('lastDays', { count: period }) },
    { label: 'openChats', value: open, icon: MessageCircle, hint: t('current') },
    { label: 'businesses', value: businessCount, icon: Building2, hint: t('total') },
  ];
  return (
    <>
      <div className="dashboard-metrics">
        {stats.map(({ label, value, icon: Icon, hint }) => (
          <article className="metric-tile" key={label}>
            <div className="metric-label">
              <span>{t(label)}</span>
              <Icon size={18} aria-hidden="true" />
            </div>
            <strong>{number.format(value)}</strong>
            <small>{hint}</small>
          </article>
        ))}
      </div>
      <div className="dashboard-charts">
        <section className="chart-card activity-chart">
          <header className="chart-heading">
            <h2>{t('activity')}</h2>
            <div className="chart-period" role="group" aria-label={t('period')}>
              {[7, 30].map((days) => (
                <button key={days} aria-pressed={period === days} onClick={() => setPeriod(days)}>
                  {t('days', { count: days })}
                </button>
              ))}
            </div>
          </header>
          <div className="chart-legend">
            <span>
              <i className="received-key" />
              {t('received')}
            </span>
            <span>
              <i className="sent-key" />
              {t('sent')}
            </span>
            <small>{t('timeZone')}</small>
          </div>
          <ActivityChart daily={daily} />
        </section>
        <ConversationChart counts={analytics.conversations} />
      </div>
    </>
  );
}

// A column that sits square on the baseline with a rounded data end.
function columnPath(x: number, baseline: number, width: number, height: number) {
  if (height <= 0) return '';
  const r = Math.min(4, width / 2, height),
    top = baseline - height;
  return `M${x} ${baseline}V${top + r}Q${x} ${top} ${x + r} ${top}H${x + width - r}Q${x + width} ${top} ${x + width} ${top + r}V${baseline}Z`;
}

function ActivityChart({ daily }: { daily: DailyActivity[] }) {
  const t = useTranslations('dashboard'),
    locale = useLocale(),
    titleId = useId();
  const [active, setActive] = useState<string | null>(null);
  const number = new Intl.NumberFormat(locale);
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
      new Date(`${value}T12:00:00Z`),
    );
  const max = Math.max(4, ...daily.flatMap((day) => [day.received, day.sent]));
  const ceiling = Math.ceil(max / 4) * 4;
  const width = 620,
    height = 168,
    left = 30,
    top = 22;
  const step = width / daily.length,
    bar = Math.min(18, step * 0.3);
  const hasMessages = daily.some((day) => day.received || day.sent);
  const selected = daily.find((day) => day.date === active);
  return (
    <div className="activity-plot">
      <svg viewBox="0 0 668 230" role="img" aria-labelledby={titleId} style={{ direction: 'ltr' }}>
        <title id={titleId}>{t('activity')}</title>
        {[0, 1, 2, 3, 4].map((tick) => {
          const y = top + height - (tick * height) / 4;
          return (
            <g key={tick} aria-hidden="true">
              <line
                x1={left}
                x2={left + width}
                y1={y}
                y2={y}
                className={tick ? 'chart-gridline' : 'chart-baseline'}
              />
              <text x={left - 9} y={y + 4} textAnchor="end" className="chart-axis">
                {number.format((ceiling * tick) / 4)}
              </text>
            </g>
          );
        })}
        {daily.map((day, index) => {
          const x = left + (index + 0.5) * step;
          const label = `${date(day.date)}: ${t('received')} ${number.format(day.received)}, ${t('sent')} ${number.format(day.sent)}`;
          return (
            <g
              key={day.date}
              role="img"
              aria-label={label}
              tabIndex={0}
              className="chart-day"
              onFocus={() => setActive(day.date)}
              onBlur={() => setActive(null)}
              onMouseEnter={() => setActive(day.date)}
              onMouseLeave={() => setActive(null)}
            >
              <title>{label}</title>
              <rect
                x={x - step / 2 + 1}
                y={top}
                width={step - 2}
                height={height}
                rx={5}
                className="chart-hit-area"
              />
              <path
                d={columnPath(x - bar - 1.5, top + height, bar, (day.received / ceiling) * height)}
                className="chart-bar-received"
              />
              <path
                d={columnPath(x + 1.5, top + height, bar, (day.sent / ceiling) * height)}
                className="chart-bar-sent"
              />
              {(daily.length === 7 ||
                (index % 7 === 0 && index < daily.length - 3) ||
                index === daily.length - 1) && (
                <text
                  x={x}
                  y={top + height + 25}
                  textAnchor="middle"
                  className="chart-axis"
                  aria-hidden="true"
                >
                  {date(day.date)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {!hasMessages && <p className="chart-empty">{t('noActivity')}</p>}
      <div className="chart-readout" aria-live="polite">
        {selected ? (
          <>
            <strong>{date(selected.date)}</strong>
            <span>
              {t('received')} {number.format(selected.received)}
            </span>
            <span>
              {t('sent')} {number.format(selected.sent)}
            </span>
          </>
        ) : (
          <span>
            {date(daily[0].date)} · {date(daily[daily.length - 1].date)}
          </span>
        )}
      </div>
    </div>
  );
}

function ConversationChart({ counts }: { counts: DashboardAnalytics['conversations'] }) {
  const t = useTranslations('dashboard'),
    status = useTranslations('crm'),
    locale = useLocale();
  const number = new Intl.NumberFormat(locale);
  const total = counts.new + counts.inProgress + counts.closed;
  // Segment colours come from the shared inquiry status tokens, matching the inbox dots.
  const segments = [
    { key: 'new', count: counts.new },
    { key: 'inProgress', count: counts.inProgress },
    { key: 'closed', count: counts.closed },
  ];
  // Leave a thin surface-coloured gap between segments when more than one is visible.
  const gap = segments.filter((segment) => segment.count).length > 1 ? 0.6 : 0;
  return (
    <section className="chart-card conversation-chart">
      <header className="chart-heading">
        <h2>{t('conversations')}</h2>
        <span>{t('current')}</span>
      </header>
      <div className="conversation-ring">
        <svg viewBox="0 0 200 200" aria-hidden="true">
          <circle cx="100" cy="100" r="78" fill="none" className="ring-track" strokeWidth="18" />
          {total > 0 &&
            segments.map((segment, index) => {
              const offset =
                (segments.slice(0, index).reduce((sum, item) => sum + item.count, 0) / total) * 100;
              const length = Math.max((segment.count / total) * 100 - gap, 0);
              return (
                <circle
                  key={segment.key}
                  cx="100"
                  cy="100"
                  r="78"
                  fill="none"
                  className={`ring-${segment.key}`}
                  strokeWidth="18"
                  pathLength="100"
                  strokeDasharray={`${length} 100`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 100 100)"
                />
              );
            })}
        </svg>
        <div>
          <strong>{number.format(total)}</strong>
          <span>{t('totalChats')}</span>
        </div>
      </div>
      <ul className="conversation-legend">
        {segments.map((segment) => (
          <li key={segment.key}>
            <span>
              <i className={`key-${segment.key}`} />
              {status(segment.key)}
            </span>
            <strong>{number.format(segment.count)}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}
