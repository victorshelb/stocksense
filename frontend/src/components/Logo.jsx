/**
 * StockSense logo — a rounded "chart" badge (rising line + candles on a
 * brand gradient) plus an optional wordmark. Theme-aware: the "Stock" part
 * uses text-white (which flips to ink on the light theme), "Sense" is brand.
 */
export default function Logo({ size = 32, withWordmark = true, wordClass = 'text-xl', className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
        <defs>
          <linearGradient id="ssLogoGrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop stopColor="#4b46d6" />
            <stop offset="0.55" stopColor="#5b6ae0" />
            <stop offset="1" stopColor="#16955f" />
          </linearGradient>
        </defs>
        {/* badge */}
        <rect width="40" height="40" rx="11" fill="url(#ssLogoGrad)" />
        {/* faint candle bars */}
        <g opacity="0.35" fill="#ffffff">
          <rect x="11" y="21" width="3" height="9" rx="1.5" />
          <rect x="19.5" y="17" width="3" height="13" rx="1.5" />
          <rect x="28" y="24" width="3" height="6" rx="1.5" />
        </g>
        {/* rising line */}
        <polyline
          points="9,26 16,20 23,23 31,11"
          stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
        />
        <circle cx="31" cy="11" r="3" fill="#ffffff" />
      </svg>
      {withWordmark && (
        <span className={`font-display font-black tracking-tight text-white ${wordClass}`}>
          Stock<span className="text-blue-400">Sense</span>
        </span>
      )}
    </span>
  );
}
