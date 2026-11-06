export default function AISummary({ data, loading, error }) {
  if (loading) return <AISkeleton />;

  if (error) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <SectionHeader />
        <p className="text-red-400 text-sm mt-2">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const rec = {
    BULLISH: { bg: 'bg-emerald-950/60', border: 'border-emerald-700', text: 'text-emerald-400', icon: '▲' },
    NEUTRAL: { bg: 'bg-amber-950/60', border: 'border-amber-700', text: 'text-amber-400', icon: '●' },
    BEARISH: { bg: 'bg-red-950/60', border: 'border-red-800', text: 'text-red-400', icon: '▼' },
  }[data.recommendation] || { bg: 'bg-slate-800', border: 'border-slate-700', text: 'text-slate-300', icon: '?' };

  const risk = {
    LOW: { color: 'text-emerald-400', bg: 'bg-emerald-900/40', label: 'Low Risk' },
    MEDIUM: { color: 'text-amber-400', bg: 'bg-amber-900/40', label: 'Medium Risk' },
    HIGH: { color: 'text-red-400', bg: 'bg-red-900/40', label: 'High Risk' },
  }[data.risk_level] || { color: 'text-slate-400', bg: 'bg-slate-800', label: data.risk_level };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-800 flex items-center gap-2">
        <SectionHeader />
        <span className="ml-auto text-xs text-slate-500 italic">
          {data.engine === 'local'
            ? '⚡ StockSense engine · on-device'
            : data.web_researched ? '🌐 Researched live · Claude' : 'Powered by Claude'}
        </span>
      </div>

      {/* Plain summary */}
      <div className="px-6 py-5">
        <p className="text-slate-300 text-sm leading-relaxed">{data.plain_summary}</p>
      </div>

      {/* Latest developments — pulled live from the web */}
      {Array.isArray(data.latest_developments) && data.latest_developments.filter(Boolean).length > 0 && (
        <div className="mx-6 mb-4 bg-indigo-950/40 border border-indigo-800 rounded-xl p-4">
          <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            🌐 Latest Developments
            <span className="text-indigo-500 normal-case font-normal">· found live on the web</span>
          </p>
          <ul className="space-y-1.5">
            {data.latest_developments.filter(Boolean).map((d, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-300 leading-snug">
                <span className="text-indigo-400 mt-0.5 shrink-0">•</span>
                {d}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Why it's moving today — shown for top gainers/losers */}
      {data.why_moving_today && data.why_moving_today !== 'null — not a top mover today' && (
        <div className="mx-6 mb-4 bg-blue-950/40 border border-blue-800 rounded-xl p-4">
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">
            🔍 Why it's moving today
          </p>
          <p className="text-sm text-slate-300 leading-relaxed">{data.why_moving_today}</p>
        </div>
      )}

      {/* Price context + Earnings trend — new fields */}
      {(data.price_context || data.earnings_trend) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 border-t border-slate-800">
          {data.price_context && (
            <div className="px-6 py-4 sm:border-r border-slate-800 border-b sm:border-b-0">
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1.5">
                📊 Price Position
              </p>
              <p className="text-sm text-slate-300 leading-snug">{data.price_context}</p>
            </div>
          )}
          {data.earnings_trend && (
            <div className="px-6 py-4">
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1.5">
                📈 Earnings Trend
              </p>
              <p className="text-sm text-slate-300 leading-snug">{data.earnings_trend}</p>
            </div>
          )}
        </div>
      )}

      {/* Recommendation */}
      <div className={`mx-6 my-5 rounded-xl border p-4 ${rec.bg} ${rec.border}`}>
        <p className="text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wider">
          AI Recommendation
        </p>
        <div className="flex items-center justify-between gap-3">
          <span className={`text-3xl font-black ${rec.text}`}>
            {rec.icon} {data.recommendation}
          </span>
          {data.risk_level && (
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${risk.bg} ${risk.color}`}>
              {risk.label}
            </span>
          )}
        </div>
        <p className="text-sm text-slate-300 mt-2 leading-snug">{data.recommendation_reason}</p>
        {data.risk_reason && (
          <p className="text-xs text-slate-500 mt-1.5 italic">{data.risk_reason}</p>
        )}
      </div>

      {/* Why Up / Why Down */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 border-t border-slate-800">
        <div className="px-6 py-5 sm:border-r border-b sm:border-b-0 border-slate-800">
          <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-3">
            ▲ Why it might go UP
          </p>
          <ul className="space-y-2">
            {(data.why_up || []).map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
        <div className="px-6 py-5">
          <p className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3">
            ▼ Why it might go DOWN
          </p>
          <ul className="space-y-2">
            {(data.why_down || []).map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                <span className="text-red-500 mt-0.5 shrink-0">•</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function SectionHeader() {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xl">🤖</span>
      <h2 className="text-lg font-bold text-white">AI Analysis</h2>
    </div>
  );
}

function AISkeleton() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-800 flex items-center gap-2">
        <span className="text-xl">🤖</span>
        <h2 className="text-lg font-bold text-white">AI Analysis</h2>
        <span className="ml-auto text-xs text-slate-500 animate-pulse">Generating…</span>
      </div>
      <div className="px-6 py-5 space-y-3">
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-5/6" />
        <div className="skeleton h-4 w-4/6" />
      </div>
      <div className="mx-6 mb-5 rounded-xl border border-slate-700 p-4 bg-slate-800/50 space-y-2">
        <div className="skeleton h-3 w-32" />
        <div className="skeleton h-8 w-40" />
        <div className="skeleton h-4 w-full" />
      </div>
      <div className="grid grid-cols-2 border-t border-slate-800">
        {[0, 1].map((i) => (
          <div key={i} className="px-6 py-5 space-y-2">
            <div className="skeleton h-3 w-28 mb-3" />
            {[1, 2, 3].map((j) => <div key={j} className="skeleton h-4 w-full" />)}
          </div>
        ))}
      </div>
    </div>
  );
}
