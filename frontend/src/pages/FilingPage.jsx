import { useEffect, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import DocumentViewer from '../components/DocumentViewer.jsx';

/* ── SEC filing education content ──────────────────────────────────────── */
const FILING_INFO = {
  '10-K': {
    title: 'Annual Report (10-K)',
    icon: '📋',
    what: 'A 10-K is a company\'s full-year report card — the most comprehensive document a public company publishes. Think of it as a company\'s yearly autobiography: it covers everything from how much money they made and lost, to what risks could hurt their business, to how they plan to grow.',
    why: 'The 10-K is the most important document for understanding a stock. If a company\'s 10-K shows strong revenue growth, improving profits, and manageable risks — the stock often goes up. If it reveals hidden problems, declining profits, or new risks — it can trigger a sell-off.',
    sections: [
      { name: 'Business Overview (Item 1)', desc: 'What the company actually does, who their customers are, and how they make money.' },
      { name: 'Risk Factors (Item 1A)', desc: 'Honest list of things that could go wrong. Higher risk count doesn\'t always mean bad — some risks are standard boilerplate.' },
      { name: "Management's Discussion (Item 7)", desc: 'Management\'s own explanation of the numbers — this is where they spin or honestly explain performance.' },
      { name: 'Financial Statements (Item 8)', desc: 'The actual numbers: income statement, balance sheet, cash flows.' },
    ],
    cadence: 'Filed once per year, within 60–90 days after the fiscal year ends.',
    color: 'blue',
  },
  '10-Q': {
    title: 'Quarterly Report (10-Q)',
    icon: '📊',
    what: 'A 10-Q is a shorter version of the 10-K, filed every 3 months. It updates investors on how the company is doing in each quarter — revenue, profits, expenses, and any new risks that popped up.',
    why: 'Quarterly reports are where most of the short-term stock movement happens. If a company beats analyst expectations (earns more than Wall Street predicted), the stock usually jumps. If they miss, it often falls — sometimes significantly, even for one bad quarter.',
    sections: [
      { name: 'Financial Results', desc: 'Revenue, profit/loss compared to the same quarter last year.' },
      { name: 'Management Discussion', desc: 'How management explains the quarter\'s performance.' },
      { name: 'Risk Updates', desc: 'Any new risks added since the last filing.' },
    ],
    cadence: 'Filed 3 times per year (Q1, Q2, Q3). The 4th quarter is covered by the annual 10-K.',
    color: 'indigo',
  },
  '8-K': {
    title: 'Current Report (8-K)',
    icon: '⚡',
    what: 'An 8-K is filed whenever something major and unexpected happens to the company — things that investors need to know about immediately. It\'s not scheduled like the 10-K or 10-Q; it\'s triggered by events.',
    why: '8-Ks often cause immediate stock price movements. Good events (acquisition, major contract, CEO upgrade) can spike the price. Bad events (earnings warning, CEO resign, lawsuit) can cause sharp drops. Traders watch 8-K filings closely.',
    sections: [
      { name: 'Entry into a Material Agreement', desc: 'Big new deals, partnerships, or contracts.' },
      { name: 'Departure / Appointment of Directors or Officers', desc: 'CEO changes, board changes.' },
      { name: 'Results of Operations / Financial Statements', desc: 'Surprise earnings announcements.' },
      { name: 'Amendments to Articles of Incorporation', desc: 'Changes to company structure.' },
    ],
    cadence: 'Filed within 4 business days of the event. No schedule — appears whenever something big happens.',
    color: 'amber',
  },
};

const COLOR_CLASSES = {
  blue:   { badge: 'bg-blue-900/40 text-blue-300 border-blue-800', accent: 'text-blue-400', border: 'border-blue-800', bg: 'bg-blue-950/30' },
  indigo: { badge: 'bg-indigo-900/40 text-indigo-300 border-indigo-800', accent: 'text-indigo-400', border: 'border-indigo-800', bg: 'bg-indigo-950/30' },
  amber:  { badge: 'bg-amber-900/40 text-amber-300 border-amber-800', accent: 'text-amber-400', border: 'border-amber-800', bg: 'bg-amber-950/30' },
};

const SENTIMENT_STYLE = {
  positive: { bg: 'bg-emerald-950/50 border-emerald-800', dot: 'bg-emerald-400', badge: 'bg-emerald-900/50 text-emerald-400', icon: '▲', label: 'Positive for stock' },
  negative: { bg: 'bg-red-950/50 border-red-900',        dot: 'bg-red-400',     badge: 'bg-red-900/50 text-red-400',         icon: '▼', label: 'May push price down' },
  neutral:  { bg: 'bg-slate-900 border-slate-800',        dot: 'bg-slate-500',   badge: 'bg-slate-800 text-slate-400',         icon: '●', label: 'Neutral / Informational' },
};

/* ── Main page ─────────────────────────────────────────────────────────── */
export default function FilingPage() {
  const location = useLocation();
  const navigate = useNavigate();

  // Receive filing metadata via React Router state
  const state = location.state;
  const symbol  = state?.symbol;
  const filing  = state?.filing; // { form, date, label, docUrl }

  const [phase, setPhase]         = useState('idle'); // idle | fetching | analyzing | done | error
  const [highlights, setHighlights] = useState([]);
  const [takeaway, setTakeaway]   = useState('');
  const [activeId, setActiveId]   = useState(null);
  const [errorMsg, setErrorMsg]   = useState('');
  const [eduOpen, setEduOpen]     = useState(false);
  const [docText, setDocText]     = useState('');
  const [view, setView]           = useState('analysis'); // 'analysis' | 'document'

  // Jump from an insight to its location in the source document
  function findInDocument(id) {
    setActiveId(id);
    setView('document');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const info   = FILING_INFO[filing?.form] || FILING_INFO['10-K'];
  const colors = COLOR_CLASSES[info.color];

  // Auto-start analysis when page loads
  useEffect(() => {
    if (!symbol || !filing?.docUrl) return;
    runAnalysis();
  }, []);

  async function runAnalysis() {
    setPhase('fetching');
    setErrorMsg('');

    try {
      const textRes = await axios.get(
        `/api/filings/${symbol}/text?url=${encodeURIComponent(filing.docUrl)}`
      );
      const { sections } = textRes.data;

      if (!sections || Object.keys(sections).length === 0) {
        setErrorMsg('Could not extract text from this filing. Please download it directly from SEC EDGAR.');
        setPhase('error');
        return;
      }

      // Build the full readable document from all extracted sections
      const fullText = Object.values(sections)
        .map((s) => `${s.label.toUpperCase()}\n\n${s.text}`)
        .join('\n\n\n');
      setDocText(fullText);

      setPhase('analyzing');

      const aiRes = await axios.post('/api/ai/highlight', {
        symbol,
        filingType: filing.form,
        sections,
        filingDate: filing.date,
      });

      setHighlights(aiRes.data.highlights || []);
      setTakeaway(aiRes.data.overall_takeaway || '');
      setPhase('done');
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Analysis failed. Try downloading the filing directly.');
      setPhase('error');
    }
  }

  if (!symbol || !filing) {
    return (
      <div className="text-center py-20">
        <p className="text-4xl mb-4">📁</p>
        <p className="text-slate-400 text-lg">No filing selected.</p>
        <Link to="/" className="inline-block mt-4 text-blue-400 hover:underline text-sm">← Back to Market</Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back link */}
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white mb-6 transition"
      >
        ← Back to {symbol}
      </button>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${colors.badge}`}>
              {info.icon} {filing.form}
            </span>
            <span className="text-xs text-slate-500">Filed {filing.date}</span>
          </div>
          <h1 className="text-3xl font-black text-white">{symbol}</h1>
          <p className="text-slate-400 text-lg mt-1">{info.title}</p>
        </div>
        <a
          href={filing.docUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white text-sm px-4 py-2 rounded-lg transition flex items-center gap-2 shrink-0"
        >
          ↓ Download Full Filing
        </a>
      </div>

      {/* ── SEC Education section ── */}
      <div className={`mb-8 border rounded-2xl overflow-hidden ${colors.bg} ${colors.border}`}>
        <button
          onClick={() => setEduOpen(v => !v)}
          className="w-full px-6 py-4 flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">{info.icon}</span>
            <div>
              <p className={`text-sm font-bold ${colors.accent}`}>What is a {filing.form}?</p>
              <p className="text-xs text-slate-500">Tap to learn why this filing matters for the stock price</p>
            </div>
          </div>
          <span className="text-slate-500 text-lg">{eduOpen ? '▲' : '▼'}</span>
        </button>

        {eduOpen && (
          <div className="px-6 pb-6 space-y-5 border-t border-slate-800/60">
            <div className="pt-4">
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2">What it is</p>
              <p className="text-sm text-slate-300 leading-relaxed">{info.what}</p>
            </div>

            <div className={`rounded-xl border p-4 ${colors.bg} ${colors.border}`}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-2">
                <span>💡</span>
                <span className={colors.accent}>Why it moves the stock price</span>
              </p>
              <p className="text-sm text-slate-300 leading-relaxed">{info.why}</p>
            </div>

            <div>
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-3">Key sections inside</p>
              <div className="space-y-2">
                {info.sections.map((s, i) => (
                  <div key={i} className="flex gap-3">
                    <span className={`text-xs font-bold shrink-0 mt-0.5 ${colors.accent}`}>{i + 1}.</span>
                    <div>
                      <p className="text-sm font-semibold text-white">{s.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>🗓</span>
              <span>{info.cadence}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Analysis section ── */}
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-xl font-bold text-white">🤖 AI Analysis</h2>
        <span className="text-xs text-slate-500 italic">Powered by Claude</span>
      </div>
      <p className="text-xs text-slate-500 mb-6">
        Claude has read this {filing.form} and highlighted the passages most likely to affect the stock price.
        Tap any highlight to read a plain-English interpretation.
      </p>

      {/* Loading states */}
      {phase === 'fetching' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-300 text-sm">Fetching filing from SEC EDGAR…</p>
          </div>
          <div className="space-y-2">{[100,85,70,90,60].map((w,i) => (
            <div key={i} className="skeleton h-3 rounded" style={{ width: `${w}%` }} />
          ))}</div>
        </div>
      )}

      {phase === 'analyzing' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-300 text-sm">Claude is reading and highlighting key passages…</p>
          </div>
          <div className="space-y-2">{[100,80,65,90,55,75].map((w,i) => (
            <div key={i} className="skeleton h-3 rounded" style={{ width: `${w}%` }} />
          ))}</div>
        </div>
      )}

      {phase === 'error' && (
        <div className="bg-slate-900 border border-red-900/40 rounded-2xl p-6">
          <p className="text-red-400 text-sm mb-3">{errorMsg}</p>
          <div className="flex gap-3 flex-wrap">
            <button onClick={runAnalysis}
              className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition">
              Try again
            </button>
            <a href={filing.docUrl} target="_blank" rel="noopener noreferrer"
              className="text-sm text-blue-400 hover:underline flex items-center gap-1">
              ↓ Download filing directly ↗
            </a>
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="space-y-4">
          {/* View toggle */}
          <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 sticky top-16 z-20">
            <button onClick={() => setView('analysis')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition ${view === 'analysis' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              🤖 AI Breakdown
            </button>
            <button onClick={() => setView('document')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition ${view === 'document' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              📄 Source Document
            </button>
          </div>

          {/* ── Document view — full filing text with AI passages highlighted ── */}
          {view === 'document' && (
            <DocumentViewer docText={docText} highlights={highlights} activeId={activeId} filing={filing} />
          )}

          {/* ── Analysis view ── */}
          {view === 'analysis' && (
          <>
          {/* Overall takeaway */}
          {takeaway && (
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                📝 Filing Summary
              </p>
              <p className="text-slate-300 text-sm leading-relaxed">{takeaway}</p>
            </div>
          )}

          {/* Highlights */}
          <div className="space-y-3">
            {highlights.map((h) => {
              const s = SENTIMENT_STYLE[h.sentiment] || SENTIMENT_STYLE.neutral;
              const isActive = activeId === h.id;

              return (
                <div
                  key={h.id}
                  onClick={() => setActiveId(isActive ? null : h.id)}
                  className={`w-full text-left border rounded-2xl p-5 transition-all duration-200 cursor-pointer ${
                    isActive ? s.bg + ' ring-2 ring-blue-500/40 brightness-110' : s.bg + ' hover:brightness-110'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.dot}`} />
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        {h.section}
                      </span>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${s.badge}`}>
                      {s.icon} {h.impact}
                    </span>
                  </div>

                  {/* Quote */}
                  <blockquote className={`text-sm text-slate-300 italic border-l-2 border-slate-600 pl-4 leading-relaxed ${isActive ? '' : 'line-clamp-3'}`}>
                    "{h.quote}"
                  </blockquote>

                  {/* Interpretation — expanded */}
                  {isActive ? (
                    <div className="mt-5 pt-4 border-t border-slate-700/60">
                      <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2">
                        What this means in plain English
                      </p>
                      <p className="text-sm text-slate-200 leading-relaxed">{h.interpretation}</p>
                      <div className="flex items-center justify-between gap-2 mt-4 flex-wrap">
                        <div className={`inline-flex items-center gap-1.5 text-xs font-semibold ${s.badge.split(' ')[1]}`}>
                          {s.icon} {s.label}
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); findInDocument(h.id); }}
                          className="text-xs bg-slate-800 hover:bg-blue-600 text-slate-300 hover:text-white border border-slate-700 hover:border-blue-500 px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
                        >
                          📄 Find in document →
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-blue-500 mt-3">Tap to read what this means →</p>
                  )}
                </div>
              );
            })}
          </div>
          </>
          )}

          {/* Download footer */}
          <div className="flex items-center justify-between py-4 border-t border-slate-800 mt-4">
            <p className="text-xs text-slate-500">
              Source: SEC EDGAR · {filing.form} · {filing.date}
            </p>
            <a
              href={filing.docUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-400 hover:text-blue-300 transition flex items-center gap-1"
            >
              ↓ Download Full {filing.form} Filing
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
