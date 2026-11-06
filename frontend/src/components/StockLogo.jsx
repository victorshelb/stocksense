import { useState, useEffect } from 'react';

// Deterministic colour per ticker for the monogram fallback
const COLORS = [
  'bg-blue-600', 'bg-emerald-600', 'bg-purple-600', 'bg-amber-600',
  'bg-rose-600', 'bg-cyan-600', 'bg-indigo-600', 'bg-teal-600', 'bg-orange-600',
];
function colorFor(s = '') {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return COLORS[Math.abs(h) % COLORS.length];
}

/**
 * Company logo with graceful fallback.
 * - `src` (e.g. Finnhub profile.logo) is tried first if provided
 * - otherwise FMP's free image-stock endpoint (keyed by ticker)
 * - on any error → a clean coloured monogram of the ticker
 */
export default function StockLogo({ symbol = '', name, src, size = 40, rounded = 'rounded-lg' }) {
  const candidates = [
    src,
    symbol && `https://financialmodelingprep.com/image-stock/${symbol}.png`,
  ].filter(Boolean);

  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [symbol, src]);

  const dim = { width: size, height: size, minWidth: size };
  const letters = (symbol.replace(/[^A-Za-z]/g, '').slice(0, 2) || symbol.slice(0, 2) || '?').toUpperCase();

  // Exhausted all image sources → monogram
  if (idx >= candidates.length) {
    return (
      <div
        style={{ ...dim, fontSize: size * 0.38 }}
        className={`${colorFor(symbol)} ${rounded} flex items-center justify-center text-white font-bold shrink-0 select-none`}
        title={name || symbol}
      >
        {letters}
      </div>
    );
  }

  return (
    <img
      src={candidates[idx]}
      alt={name || symbol}
      style={dim}
      loading="lazy"
      className={`${rounded} object-contain bg-white shrink-0`}
      onError={() => setIdx((i) => i + 1)}
    />
  );
}
