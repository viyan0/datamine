'use client';

import { useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { DashboardAnalytics, DailyActivity } from '@/lib/dashboard-analytics';

// Latin digits on both server and client, so Arabic-locale pages hydrate identically.
export function useNumber() {
  const locale = useLocale();
  return new Intl.NumberFormat(locale, { numberingSystem: 'latn' });
}

function useDay() {
  const locale = useLocale();
  return (value: string) =>
    new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
      numberingSystem: 'latn',
    }).format(new Date(`${value}T12:00:00Z`));
}

export const statusKeys = ['new', 'inProgress', 'closed'] as const;

/** Tall pill bars for conversations by status (white, hatched and accent pills). */
export function StatusBars({ counts }: { counts: DashboardAnalytics['conversations'] }) {
  const t = useTranslations('dashboard'),
    status = useTranslations('crm'),
    number = useNumber();
  const max = Math.max(1, ...statusKeys.map((key) => counts[key]));
  return (
    <section className="well ov-status" aria-label={t('conversations')}>
      <div className="ov-status-bars">
        {statusKeys.map((key) => (
          <div className="ov-status-col" key={key}>
            <div
              className={`ov-pill ov-pill-${key}`}
              style={{ height: `${Math.max(18, (counts[key] / max) * 100)}%` }}
            >
              <strong>{number.format(counts[key])}</strong>
            </div>
            <span>{status(key)}</span>
          </div>
        ))}
      </div>
      <p className="ov-caption">
        <span>{t('conversations')}</span>
        <b>{t('current')}</b>
      </p>
    </section>
  );
}

/** Red summary panel plus daily pill bars, like the reference "average monthly" card. */
export function ActivityCard({
  daily,
  period,
  setPeriod,
  open,
}: {
  daily: DailyActivity[];
  period: number;
  setPeriod: (days: number) => void;
  open: number;
}) {
  const t = useTranslations('dashboard'),
    number = useNumber(),
    day = useDay(),
    titleId = useId();
  const [active, setActive] = useState<string | null>(null);
  const received = daily.reduce((sum, d) => sum + d.received, 0);
  const sent = daily.reduce((sum, d) => sum + d.sent, 0);
  const max = Math.max(4, ...daily.flatMap((d) => [d.received, d.sent]));
  const ceiling = Math.ceil(max / 4) * 4;
  const peak = daily.reduce((best, d) => (d.received > best.received ? d : best), daily[0]);
  const selected = daily.find((d) => d.date === active);
  const ticks = [4, 3, 2, 1, 0].map((n) => (ceiling * n) / 4);
  return (
    <section className="card ov-activity" aria-labelledby={titleId}>
      <header className="ov-activity-head">
        <div>
          <p className="ov-muted">{t('activity')}</p>
          <h2 id={titleId}>{t('lastDays', { count: period })}</h2>
        </div>
        <div className="segmented" role="group" aria-label={t('period')}>
          {[7, 30].map((days) => (
            <button key={days} aria-pressed={period === days} onClick={() => setPeriod(days)}>
              {t('days', { count: days })}
            </button>
          ))}
        </div>
      </header>
      <div className="ov-activity-body">
        <div className="ov-red">
          <span className="ov-red-label">{t('activity')}</span>
          <dl>
            <div>
              <dt>{t('received')}</dt>
              <dd>{number.format(received)}</dd>
            </div>
            <div>
              <dt>{t('sent')}</dt>
              <dd>
                {number.format(sent)}
                <span> / {number.format(received)}</span>
              </dd>
            </div>
            <div>
              <dt>{t('openChats')}</dt>
              <dd>{number.format(open)}</dd>
            </div>
          </dl>
        </div>
        <div className="ov-plot">
          <div className={`ov-days ${daily.length > 7 ? 'is-dense' : ''}`}>
            {daily.map((d, index) => {
              const label = `${day(d.date)}: ${t('received')} ${number.format(d.received)}, ${t('sent')} ${number.format(d.sent)}`;
              const showLabel = daily.length === 7 || index % 7 === 0 || index === daily.length - 1;
              return (
                <button
                  type="button"
                  key={d.date}
                  className={`ov-day ${active === d.date ? 'is-active' : ''}`}
                  aria-label={label}
                  title={label}
                  onFocus={() => setActive(d.date)}
                  onBlur={() => setActive(null)}
                  onMouseEnter={() => setActive(d.date)}
                  onMouseLeave={() => setActive(null)}
                >
                  {peak.received > 0 && d.date === peak.date && (
                    <span className="ov-tag">{number.format(d.received)}</span>
                  )}
                  <span className="ov-bars">
                    <i
                      className="ov-bar-received"
                      style={{ height: `${(d.received / ceiling) * 100}%` }}
                    />
                    <i className="ov-bar-sent" style={{ height: `${(d.sent / ceiling) * 100}%` }} />
                  </span>
                  <small aria-hidden="true">{showLabel ? day(d.date) : ''}</small>
                </button>
              );
            })}
          </div>
          <ol className="ov-ticks" aria-hidden="true">
            {ticks.map((tick) => (
              <li key={tick}>{number.format(tick)}</li>
            ))}
          </ol>
        </div>
      </div>
      <footer className="ov-activity-foot" aria-live="polite">
        <span className="ov-key">
          <i className="ov-key-received" />
          {t('received')}
        </span>
        <span className="ov-key">
          <i className="ov-key-sent" />
          {t('sent')}
        </span>
        <span className="ov-readout">
          {selected ? (
            <>
              <b>{day(selected.date)}</b> · {t('received')} {number.format(selected.received)} ·{' '}
              {t('sent')} {number.format(selected.sent)}
            </>
          ) : received || sent ? (
            `${day(daily[0].date)} – ${day(daily[daily.length - 1].date)} · ${t('timeZone')}`
          ) : (
            t('noActivity')
          )}
        </span>
      </footer>
    </section>
  );
}
