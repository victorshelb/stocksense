/**
 * ChartInsight — renders the chart-reading engine's output (backend
 * utils/chartAnalysis.js): trend, plain-English read, technical signals,
 * and the biggest up/down days. Sits right under the price chart.
 */
export default function ChartInsight({ data, loading }) {
  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">
        <div className="skeleton h-5 w-56 mb-4" />
        <div className="skeleton h-4 w-full mb-2" />
        <div className="skeleton h-4 w-5/6" />
      </div>
    );
  }
  if (!data?.analysis) return null;
  const a = data.analysis;

  const tone = a.trendClass === 'up'
    ? { text: 'text-emerald-400', bg: 'bg-emerald-900/40', arrow: '▲' }
    : a.trendClass === 'down'
    ? { text: 'text-red-400', bg: 'bg-red-900/40', arrow: '▼' }
    : { text: 'text-slate-300', bg: 'bg-slate-800', arrow: '→' };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden mb-8">
      <div className="px-6 py-4 border-b border-slate-800 flex items-center gap-2 flex-wrap">
        <span className="text-xl">🔎</span>
        <h2 className="text-lg font-bold text-white">What the chart is telling us</h2>
        <span className="text-[11px] bg-slate-800 text-slate-400 px-2 py-1 rounded-full">⚡ Reads price history · no AI cost</span>
        <span className={`ml-auto text-xs font-bold px-2.5 py-1 rounded-full ${tone.bg} ${tone.text}`}>
          {tone.arrow} {a.trend} · {a.periodReturn}
        </span>
      </div>

      <div className="px-6 py-5">
        <p className="text-sm text-slate-300 leading-relaxed">{a.summary}</p>

        {/* technical signals */}
        {a.signals?.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-5">
            {a.signals.map((s, i) => (
              <div key={i} className="bg-slate-800/50 border border-slate-800 rounded-xl p-3">
                <p className="text-[11px] text-slate-500 uppercase tracking-wide">{s.label}</p>
                <p className="text-sm font-bold text-white mt-0.5">{s.value}</p>
                {s.detail && <p className="text-[11px] text-slate-500 mt-0.5">{s.detail}</p>}
              </div>
            ))}
          </div>
        )}

        {/* biggest moves */}
        {a.keyMoves?.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">Biggest days:</span>
            {a.keyMoves.map((m, i) => (
              <span
                key={i}
                className={`text-xs font-semibold px-2.5 py-1 rounded-full ${m.direction === 'up' ? 'bg-emerald-900/40 text-emerald-400' : 'bg-red-900/40 text-red-400'}`}
              >
                {m.direction === 'up' ? '▲' : '▼'} {m.pct} on {m.date}
              </span>
            ))}
          </div>
        )}

        <p className="text-[11px] text-slate-500 mt-4">{a.disclaimer}</p>
      </div>
    </div>
  );
}
