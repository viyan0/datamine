'use client';
import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Sparkles, ChevronDown, LoaderCircle } from 'lucide-react';
import { factNames, type AnalysisResult, type AnalysisState } from '@/lib/analysis-types';
import { sampleAnalyses } from '@/lib/demo-analysis';

export function ConversationAnalysis({
  id,
  url,
  demo,
  editable,
  revision,
  lastMessageAt,
}: {
  id: string;
  url: string;
  demo: boolean;
  editable: boolean;
  revision: number;
  lastMessageAt: string;
}) {
  const t = useTranslations('ai'),
    crm = useTranslations('crm'),
    errors = useTranslations('errors'),
    locale = useLocale();
  const [state, setState] = useState<AnalysisState>({
    analysis: null,
    stale: false,
    configured: false,
  });
  const [sample, setSample] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(!demo),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const running = useRef(false),
    generation = useRef(0);
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    const current = ++generation.current;
    fetch(`${url}/analysis`, { cache: 'no-store', signal: controller.signal })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        if (generation.current === current) {
          setState(data);
          setError('');
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted && generation.current === current) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [url, demo, revision, lastMessageAt]);
  async function analyze() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    ++generation.current;
    try {
      if (demo) {
        const preview = sampleAnalyses[id];
        setSample({
          ...preview,
          summary: t(`samples.${preview.copyKey}.summary`),
          nextStep: t(`samples.${preview.copyKey}.nextStep`),
          reviewNote: t(`samples.${preview.copyKey}.reviewNote`),
        });
      } else {
        const response = await fetch(`${url}/analysis`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locale }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setState({ configured: true, stale: false, analysis: data.analysis });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'analysisUnavailable');
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  const result = demo ? sample : state.analysis?.result;
  return (
    <div className="analysis-card" aria-label={t('title')} aria-busy={busy}>
      <div className="analysis-heading">
        <span>
          <Sparkles size={15} />
          <strong>{t('title')}</strong>
        </span>
        {editable && (
          <button
            type="button"
            className="analysis-button"
            onClick={analyze}
            disabled={busy || loading || (!demo && !state.configured)}
          >
            {busy ? (
              <LoaderCircle size={13} className="analysis-spinner" />
            ) : (
              <Sparkles size={13} />
            )}
            {t(busy ? 'analyzing' : demo ? 'preview' : result ? 'refresh' : 'analyze')}
          </button>
        )}
      </div>
      <p className="analysis-caption">{t(demo ? 'demoHint' : 'hint')}</p>
      {!demo && !loading && !state.configured && <p className="analysis-notice">{t('setup')}</p>}
      {(state.stale || (!demo && state.analysis && state.analysis.locale !== locale)) && (
        <p className="analysis-notice">{t('stale')}</p>
      )}
      {error && (
        <p className="inbox-error" role="alert">
          {errors.has(error) ? errors(error) : errors('analysisUnavailable')}
        </p>
      )}
      {result && (
        <>
          <div className="analysis-tags">
            {result.services.map((service) => (
              <span key={service}>{crm(service)}</span>
            ))}
            <span>{t(`intents.${result.intent}`)}</span>
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
              {factNames.map((field) => (
                <div key={field}>
                  <dt>{t(field)}</dt>
                  <dd dir="auto">{result.facts[field]?.value || t('unknown')}</dd>
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
            {factNames.some((field) => result.facts[field]) && (
              <details className="analysis-evidence">
                <summary>{t('sources')}</summary>
                {factNames.map((field) => {
                  const fact = result.facts[field];
                  return fact ? (
                    <div key={field}>
                      <strong>{t(field)}</strong>
                      <q dir="auto">{fact.quote}</q>
                    </div>
                  ) : null;
                })}
              </details>
            )}
            <p className="analysis-footnote">{t(demo ? 'sampleResult' : 'reviewHint')}</p>
          </details>
        </>
      )}
      <span className="sr-only" role="status">
        {busy ? t('analyzing') : result ? t('ready') : ''}
      </span>
    </div>
  );
}
