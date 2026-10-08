import { useTranslations } from 'next-intl';
import { ArrowUpRight } from 'lucide-react';
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <span className={`brand ${light ? 'brand-light' : ''}`}>
      <span className="brand-mark">
        <span />
        <span />
        <span />
        <span />
      </span>
      <span>
        datamine<span className="brand-period">.</span>
      </span>
    </span>
  );
}
export function JourneyArt({ compact = false }: { compact?: boolean }) {
  const t = useTranslations();
  return (
    <div className={`journey-art ${compact ? 'compact' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 600 350" fill="none">
        <defs>
          <pattern
            id={compact ? 'grid-c' : 'grid'}
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r="1" fill="currentColor" opacity=".17" />
          </pattern>
        </defs>
        <rect width="600" height="350" fill={`url(#${compact ? 'grid-c' : 'grid'})`} />
        <ellipse cx="300" cy="210" rx="225" ry="105" stroke="currentColor" opacity=".13" />
        <ellipse cx="300" cy="210" rx="158" ry="105" stroke="currentColor" opacity=".13" />
        <ellipse cx="300" cy="210" rx="70" ry="105" stroke="currentColor" opacity=".13" />
        <path d="M75 210H525M96 162H502M96 258H502" stroke="currentColor" opacity=".13" />
        <path
          d="M126 241C200 237 147 67 272 128S430 237 484 112"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="5 7"
          opacity=".7"
        />
        <circle cx="126" cy="241" r="7" fill="currentColor" />
        <circle cx="126" cy="241" r="18" stroke="currentColor" opacity=".25" />
        <circle cx="484" cy="112" r="7" fill="currentColor" />
        <circle cx="484" cy="112" r="18" stroke="currentColor" opacity=".25" />
        <path d="M284 137h42v28h-20l-13 11v-11h-9z" fill="currentColor" />
      </svg>
      {!compact && (
        <>
          <div className="art-tag art-tag-one">
            <span className="small-dot" /> {t('conversationsArt')} <ArrowUpRight size={14} />
          </div>
          <div className="art-tag art-tag-two">
            <span className="small-dot" /> {t('customers')} <ArrowUpRight size={14} />
          </div>
        </>
      )}
    </div>
  );
}
