'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles, ChevronDown, LoaderCircle } from 'lucide-react';
import type { AnalysisState } from '@/lib/analysis-types';
import { sampleAnalyses } from '@/lib/demo-analysis';
export function ConversationAnalysis({
  id,
  url,
  demo,
  revision,
  lastMessageAt,
}: {
  id: string;
  url: string;
  demo: boolean;
  revision: number;
  lastMessageAt: string;
}) {
  const t = useTranslations('ai'),
    crm = useTranslations('crm'),
    errors = useTranslations('errors');
  const [state, setState] = useState<AnalysisState>({
    analysis: null,
    stale: false,
    configured: false,
    status: 'pending',
    error: null,
  });
  const [error, setError] = useState(''),
    [loaded, setLoaded] = useState(demo);
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    let running = false;
    const load = async () => {
      if (running) return;
      running = true;
      try {
        const response = await fetch(`${url}/analysis`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (!controller.signal.aborted) {
          setState(data);
          setError('');
          setLoaded(true);
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : 'analysisUnavailable');
      } finally {
        running = false;
      }
    };
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 4000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [url, demo, revision, lastMessageAt]);
  const preview = sampleAnalyses[id];
  const result =
    demo && preview
      ? {
          ...preview,
          summary: t(`samples.${preview.copyKey}.summary`),
          nextStep: t(`samples.${preview.copyKey}.nextStep`),
          reviewNote: t(`samples.${preview.copyKey}.reviewNote`),
        }
      : state.analysis?.result;
  const busy = !demo && state.configured && ['pending', 'processing'].includes(state.status);
  const facts = result
    ? [...(result.subject ? [{ label: 'request', ...result.subject }] : []), ...result.facts]
    : [];
  return (
    <div className="analysis-card" aria-label={t('title')} aria-busy={busy}>
      <div className="analysis-heading">
        <span>
          <Sparkles size={15} />
          <strong>{t('title')}</strong>
        </span>
        <span className="analysis-auto">
          {busy && <LoaderCircle size={13} className="analysis-spinner" />}
          {t(demo ? 'sampleBadge' : busy ? 'analyzing' : 'automatic')}
        </span>
      </div>
      <p className="analysis-caption">{t(demo ? 'demoHint' : 'hint')}</p>
      {!demo && loaded && !state.configured && <p className="analysis-notice">{t('setup')}</p>}
      {!demo && state.configured && state.status === 'error' && (
        <p className="analysis-notice">{t('retrying')}</p>
      )}
      {!demo && state.status === 'awaitingConsent' && (
        <p className="analysis-notice">{t('awaitingConsent')}</p>
      )}
      {!demo && state.status === 'waitingForText' && (
        <p className="analysis-notice">{errors('analysisNoText')}</p>
      )}
      {error && (
        <p className="inbox-error" role="alert">
          {errors.has(error) ? errors(error) : errors('analysisUnavailable')}
        </p>
      )}
      {result && (
        <>
          <div className="analysis-tags">
            {result.services.map((s) => (
              <span key={s}>{crm.has(s) ? crm(s) : s}</span>
            ))}
            <span>
              {t.has(`intents.${result.intent}`) ? t(`intents.${result.intent}`) : result.intent}
            </span>
          </div>
          <p className="analysis-summary" dir="auto">
            {result.summary}
          </p>
          <details className="analysis-details">
            <summary>
              {t('travelDetails')}
              <ChevronDown size={13} />
            </summary>
            <dl>
              {facts.map((fact, i) => (
                <div key={i}>
                  <dt dir="auto">{t.has(fact.label) ? t(fact.label) : fact.label}</dt>
                  <dd dir="auto">{fact.value}</dd>
                </div>
              ))}
              <div>
                <dt>{t('language')}</dt>
                <dd>{t(`languages.${result.language}`)}</dd>
              </div>
            </dl>
            <p className="analysis-next">
              <strong>{t('nextStep')}</strong>
              <span dir="auto">{result.nextStep}</span>
            </p>
            {result.reviewNote && (
              <p className="analysis-notice" dir="auto">
                {result.reviewNote}
              </p>
            )}
            {!!facts.length && (
              <details className="analysis-evidence">
                <summary>{t('sources')}</summary>
                {facts.map((fact, i) => (
                  <div key={i}>
                    <strong>{t.has(fact.label) ? t(fact.label) : fact.label}</strong>
                    <q dir="auto">{fact.quote}</q>
                  </div>
                ))}
              </details>
            )}
            <p className="analysis-footnote">{t(demo ? 'sampleResult' : 'reviewHint')}</p>
          </details>
        </>
      )}
    </div>
  );
}
