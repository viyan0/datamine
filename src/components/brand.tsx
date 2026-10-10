import { useTranslations } from 'next-intl';
import { ArrowUpRight, MessageCircle, Users } from 'lucide-react';
export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <span className={`brand ${light ? 'brand-light' : ''}`}>
      <BrandMark />
      <span>
        datamine<span className="brand-period">.</span>
      </span>
    </span>
  );
}
/* Decorative "first hello to lasting connection" journey. Drawn in currentColor so the
   surrounding panel decides the palette (white on the raspberry sign-in panel). */
export function JourneyArt({ compact = false }: { compact?: boolean }) {
  const t = useTranslations();
  const grid = compact ? 'journey-grid-c' : 'journey-grid',
    hatch = compact ? 'journey-hatch-c' : 'journey-hatch';
  return (
    <div className={`journey-art ${compact ? 'compact' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 600 360" fill="none">
        <defs>
          <pattern id={grid} width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1.2" fill="currentColor" opacity=".22" />
          </pattern>
          <pattern
            id={hatch}
            width="11"
            height="11"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="5" height="11" fill="currentColor" opacity=".3" />
          </pattern>
        </defs>
        <rect width="600" height="360" fill={`url(#${grid})`} />
        <g className="journey-orbits" stroke="currentColor" opacity=".2">
          <ellipse cx="300" cy="200" rx="236" ry="112" />
          <ellipse cx="300" cy="200" rx="164" ry="112" />
          <ellipse cx="300" cy="200" rx="72" ry="112" />
          <path d="M64 200H536M86 148H514M86 252H514" />
        </g>
        <circle cx="478" cy="104" r="46" fill={`url(#${hatch})`} />
        <path
          d="M122 252C204 248 148 64 276 124S434 230 478 104"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="2 9"
        />
        <circle cx="122" cy="252" r="22" stroke="currentColor" opacity=".35" />
        <circle cx="122" cy="252" r="8" fill="currentColor" />
        <circle cx="478" cy="104" r="22" fill="currentColor" />
        <circle className="journey-core" cx="478" cy="104" r="7" />
        <rect x="270" y="118" width="60" height="42" rx="21" fill="currentColor" />
        <path d="M284 156l-6 16 20-12z" fill="currentColor" />
        <circle className="journey-core" cx="286" cy="139" r="3.5" />
        <circle className="journey-core" cx="300" cy="139" r="3.5" />
        <circle className="journey-core" cx="314" cy="139" r="3.5" />
      </svg>
      {!compact && (
        <>
          <div className="art-tag art-tag-one">
            <span className="art-tag-icon">
              <MessageCircle size={15} />
            </span>
            {t('conversationsArt')}
            <ArrowUpRight size={15} className="directional" />
          </div>
          <div className="art-tag art-tag-two">
            <span className="art-tag-icon">
              <Users size={15} />
            </span>
            {t('customers')}
            <ArrowUpRight size={15} className="directional" />
          </div>
        </>
      )}
    </div>
  );
}
