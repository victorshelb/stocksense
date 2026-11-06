import { useState, useEffect } from 'react';
import axios from 'axios';

const TREND_STYLE = {
  IMPROVING: { color: 'text-emerald-400', bg: 'bg-emerald-900/30 border-emerald-700', icon: '▲' },
  DECLINING:  { color: 'text-red-400',     bg: 'bg-red-900/30 border-red-800',         icon: '▼' },
  STABLE:     { color: 'text-blue-400',    bg: 'bg-blue-900/30 border-blue-800',        icon: '→' },
  MIXED:      { color: 'text-amber-400',   bg: 'bg-amber-900/30 border-amber-800',      icon: '~' },
};

const SENTIMENT = {
  positive: { color: 'text-emerald-400', icon: '▲' },
  negative: { color: 'text-red-400',     icon: '▼' },
  neutral:  { color: 'text-slate-400',   icon: '●' },
};

export default function FinancialsModal({ symbol, companyName, section, sectionLabel, annualData, quarterlyData, metrics, onClose }) {
  const [phase, setPhase]         = useState('loading');
  const [analysis, setAnalysis]   = useState(null);
  const [error, setError]         = useState('');

  useEffect(() => {
    let cancelled = false;
    axios.post('/api/ai/analyze-financials', {
      symbol, companyName, section, annualData, quarterlyData, metrics,
    })
      .then(r => { if (!cancelled) { setAnalysis(r.data); setPhase('done'); } })
      .catch(e => { if (!cancelled) { setError(e.response?.data?.error || 'Analysis failed.'); setPhase('error'); } });
    return () => { cancelled = true; };
  }, [symbol, section]);

  const trend = analysis?.trend ? TREND_STYLE[analysis.trend] || TREND_STYLE.STABLE : null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* Drawer — slides in from right */}
      <div className="fixed top-0 right-0 h-full w-full sm:w-[520px] bg-slate-900 border-l border-slate-800 z-50 overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-5 py-4 flex items-center justify-between gap-3 z-10">
          <div>
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">AI Breakdown</p>
            <h2 className="text-lg font-bold text-white">{sectionLabel} — {symbol}</h2>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition flex items-center justify-center text-lg">
            ✕
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">

          {/* Loading */}
          {phase === 'loading' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
                <p className="text-slate-300 text-sm">Claude is reading the financial data…</p>
              </div>
              {[100,80,65,90,55,75,60].map((w,i) => (
                <div key={i} className="skeleton h-3 rounded" style={{ width: `${w}%` }} />
              ))}
            </div>
          )}

          {/* Error */}
          {phase === 'error' && (
            <div className="bg-red-950/40 border border-red-800 rounded-xl p-4">
              <p className="text-red-400 text-sm">{error}</p>
              <button onClick={() => { setPhase('loading'); setError(''); }}
                className="mt-3 text-xs text-blue-400 hover:underline">Try again</button>
            </div>
          )}

          {/* Done */}
          {phase === 'done' && analysis && (
            <>
              {/* Plain English summary */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2">
                  📝 Plain English Summary
                </p>
                <p className="text-slate-300 text-sm leading-relaxed">{analysis.summary}</p>
              </div>

              {/* Trend badge */}
              {trend && (
                <div className={`border rounded-xl p-4 ${trend.bg}`}>
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">
                    Overall Trend
                  </p>
                  <p className={`text-xl font-black ${trend.color}`}>
                    {trend.icon} {analysis.trend}
                  </p>
                  <p className="text-slate-300 text-sm mt-1.5 leading-snug">
                    {analysis.trendExplanation}
                  </p>
                </div>
              )}

              {/* Key highlights */}
              {analysis.highlights?.length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-3">
                    🔍 Key Metrics Explained
                  </p>
                  <div className="space-y-3">
                    {analysis.highlights.map((h, i) => {
                      const s = SENTIMENT[h.sentiment] || SENTIMENT.neutral;
                      return (
                        <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <p className="text-sm font-bold text-white">{h.metric}</p>
                            <span className={`text-xs font-bold shrink-0 ${s.color}`}>
                              {s.icon} {h.value}
                            </span>
                          </div>
                          <p className="text-slate-400 text-sm leading-snug">{h.what_it_means}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Stock impact */}
              {analysis.stockImpact && (
                <div className="bg-blue-950/30 border border-blue-800/50 rounded-xl p-4">
                  <p className="text-xs text-blue-400 font-semibold uppercase tracking-wider mb-2">
                    💡 How This Affects the Stock
                  </p>
                  <p className="text-slate-300 text-sm leading-relaxed">{analysis.stockImpact}</p>
                </div>
              )}

              {/* Opportunities & Risks */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {analysis.opportunities?.length > 0 && (
                  <div className="bg-emerald-950/30 border border-emerald-900 rounded-xl p-4">
                    <p className="text-xs text-emerald-400 font-semibold uppercase tracking-wider mb-2">▲ Opportunities</p>
                    <ul className="space-y-1.5">
                      {analysis.opportunities.map((o, i) => (
                        <li key={i} className="text-xs text-slate-300 flex gap-2">
                          <span className="text-emerald-500 shrink-0">•</span>{o}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {analysis.risks?.length > 0 && (
                  <div className="bg-red-950/30 border border-red-900 rounded-xl p-4">
                    <p className="text-xs text-red-400 font-semibold uppercase tracking-wider mb-2">▼ Risks</p>
                    <ul className="space-y-1.5">
                      {analysis.risks.map((r, i) => (
                        <li key={i} className="text-xs text-slate-300 flex gap-2">
                          <span className="text-red-500 shrink-0">•</span>{r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Source reference */}
              {analysis.reference_note && (
                <p className="text-xs text-slate-600 border-t border-slate-800 pt-4">
                  📎 {analysis.reference_note}
                </p>
              )}

              {/* Disclaimer */}
              <div className="bg-amber-950/20 border border-amber-900/30 rounded-xl p-3">
                <p className="text-xs text-amber-600">
                  ⚠️ This analysis is AI-generated for educational purposes only — not financial advice.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
