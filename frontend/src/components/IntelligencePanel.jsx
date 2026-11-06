/**
 * IntelligencePanel — renders the local quant model's output:
 * a health-score dial, weather pill, trend, and four metric bars
 * (momentum / growth / sentiment / value). Powered entirely by
 * backend/utils/intelligence.js — no AI API call.
 */

const BAND = {
  good:    { text: 'text-emerald-400', stroke: 'text-emerald-500', fill: 'bg-emerald-500', pill: 'bg-emerald-900/40 text-emerald-300' },
  mixed:   { text: 'text-amber-400',   stroke: 'text-amber-500',   fill: 'bg-amber-500',   pill: 'bg-amber-900/40 text-amber-300' },
  weak:    { text: 'text-red-400',     stroke: 'text-red-500',     fill: 'bg-red-500',     pill: 'bg-red-900/40 text-red-300' },
  unknown: { text: 'text-slate-400',   stroke: 'text-slate-600',   fill: 'bg-slate-600',   pill: 'bg-slate-800 text-slate-400' },
};
const scoreBand = (s) => (s == null ? 'unknown' : s >= 60 ? 'good' : s >= 40 ? 'mixed' : 'weak');
const healthBand = (b) => (b === 'good' ? 'good' : b === 'mixed' ? 'mixed' : b === 'weak' ? 'weak' : 'unknown');

function Gauge({ score, band }) {
  const R = 64, C = 2 * Math.PI * R, SWEEP = 0.75;
  const f = score == null ? 0 : Math.max(0, Math.min(1, score / 100));
  const b = BAND[band] || BAND.unknown;
  return (
    <div className="relative w-40 h-40 shrink-0">
      <svg viewBox="0 0 160 160" className="w-40 h-40">
        <g transform="rotate(135 80 80)">
          <circle cx="80" cy="80" r={R} fill="none" strokeWidth="12" stroke="currentColor"
            className="text-slate-800" strokeDasharray={`${C * SWEEP} ${C}`} strokeLinecap="round" />
          <circle cx="80" cy="80" r={R} fill="none" strokeWidth="12" stroke="currentColor"
            className={b.stroke} strokeDasharray={`${C * SWEEP * f} ${C}`} strokeLinecap="round"
            style={{ transition: 'stroke-dasharray .8s ease' }} />
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-4xl font-black leading-none ${b.text}`}>{score ?? '—'}</span>
        <span className="text-[10px] tracking-widest text-slate-500 mt-1">/ 100</span>
        <span className="text-[11px] font-semibold tracking-wider text-slate-400 mt-0.5">HEALTH</span>
      </div>
    </div>
  );
}

function Bar({ name, pillar }) {
  const s = pillar?.score;
  const b = BAND[scoreBand(s)];
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-slate-200 capitalize">{name}</span>
        <span className={`text-xs font-bold ${b.text}`}>{s ?? '—'}{s != null && <span className="text-slate-500 font-medium"> · {pillar.label}</span>}</span>
      </div>
      <div className="h-2 bg-slate-800 rounded-full mt-1.5 overflow-hidden">
        <div className={`h-full rounded-full ${b.fill}`} style={{ width: `${s ?? 0}%`, transition: 'width .8s ease' }} />
      </div>
      {pillar?.drivers?.length > 0 && (
        <p className="text-[11px] text-slate-500 mt-1">{pillar.drivers.join(' · ')}</p>
      )}
    </div>
  );
}

export default function IntelligencePanel({ intel }) {
  if (!intel) return null;
  const band = healthBand(intel.weather?.band);
  const b = BAND[band];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden mb-8">
      {/* header */}
      <div className="px-6 py-4 border-b border-slate-800 flex items-center gap-2 flex-wrap">
        <span className="text-xl">🧠</span>
        <h2 className="text-lg font-bold text-white">StockSense Intelligence</h2>
        <span className="text-[11px] bg-slate-800 text-slate-400 px-2 py-1 rounded-full">⚡ Local model · no AI cost</span>
        {intel.healthScore != null && (
          <span className={`ml-auto text-xs font-semibold px-2.5 py-1 rounded-full ${b.pill}`}>
            {intel.trend}
          </span>
        )}
      </div>

      {intel.healthScore == null ? (
        <div className="px-6 py-10 text-center">
          <p className="text-3xl mb-2">{intel.weather?.icon || '❓'}</p>
          <p className="text-slate-300 text-sm">{intel.summary}</p>
        </div>
      ) : (
        <div className="p-6 grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 items-center">
          {/* dial + weather */}
          <div className="flex flex-col items-center text-center">
            <Gauge score={intel.healthScore} band={band} />
            <span className={`mt-3 text-sm font-semibold px-3 py-1 rounded-full ${b.pill}`}>
              {intel.weather?.icon} {intel.weather?.label}
            </span>
          </div>

          {/* bars */}
          <div className="space-y-3.5">
            <Bar name="momentum"  pillar={intel.pillars?.momentum} />
            <Bar name="growth"    pillar={intel.pillars?.growth} />
            <Bar name="sentiment" pillar={intel.pillars?.sentiment} />
            <Bar name="value"     pillar={intel.pillars?.value} />
          </div>
        </div>
      )}

      {/* summary + disclaimer */}
      {intel.healthScore != null && (
        <div className="px-6 pb-5 -mt-1">
          <p className="text-sm text-slate-300 leading-relaxed">{intel.summary}</p>
          <p className="text-[11px] text-slate-500 mt-2">
            {intel.confidence === 'high' ? 'High' : intel.confidence === 'medium' ? 'Medium' : 'Limited'} data confidence ·{' '}
            {intel.disclaimer}
          </p>
        </div>
      )}
    </div>
  );
}
