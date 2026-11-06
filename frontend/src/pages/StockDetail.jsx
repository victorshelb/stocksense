import { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import AISummary from '../components/AISummary.jsx';
import NewsCard from '../components/NewsCard.jsx';
import TradingViewChart from '../components/TradingViewChart.jsx';
import IntelligencePanel from '../components/IntelligencePanel.jsx';
import ChartInsight from '../components/ChartInsight.jsx';
import StockLogo from '../components/StockLogo.jsx';
import { useWatchlist } from '../context/WatchlistContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import FinancialSection from '../components/FinancialSection.jsx';

/* ── helpers ──────────────────────────────────────────────────────────── */
const fmt = (n) => {
  const num = parseFloat(n);
  if (isNaN(num)) return 'N/A';
  return `$${num.toFixed(num < 1 ? 4 : 2)}`;
};
const fmtLarge = (n) => {
  const num = parseFloat(n);
  if (isNaN(num)) return 'N/A';
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9)  return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6)  return `$${(num / 1e6).toFixed(2)}M`;
  return `$${num.toFixed(2)}`;
};
const fmtPct = (n) => {
  const num = parseFloat(n);
  return isNaN(num) ? 'N/A' : (num * 100).toFixed(1) + '%';
};

function Stat({ label, value, sub }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-3">
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-white">{value || 'N/A'}</p>
      {sub && <p className="text-xs text-slate-600 mt-0.5">{sub}</p>}
    </div>
  );
}

/* ── Movement banner ──────────────────────────────────────────────────── */
function MovementBanner({ from, changeToday }) {
  if (!from || !changeToday) return null;
  const isGainer = from === 'gainers';
  const change = changeToday.startsWith('+') ? changeToday : changeToday.startsWith('-') ? changeToday : `+${changeToday}`;

  return (
    <div className={`mb-6 rounded-xl border px-5 py-3 flex items-center gap-3 ${
      isGainer
        ? 'bg-emerald-950/40 border-emerald-800'
        : 'bg-red-950/40 border-red-900'
    }`}>
      <span className="text-2xl">{isGainer ? '🚀' : '📉'}</span>
      <div>
        <p className={`text-base font-bold ${isGainer ? 'text-emerald-400' : 'text-red-400'}`}>
          Today's Top {isGainer ? 'Gainer' : 'Loser'}: {change} today
        </p>
        <p className="text-xs text-slate-400 mt-0.5">
          The AI analysis below is focused on explaining <strong>why</strong> this stock is moving so strongly.
        </p>
      </div>
    </div>
  );
}

/* ── 52-week range bar ────────────────────────────────────────────────── */
function RangeBar({ low, high, current }) {
  const lo = parseFloat(low), hi = parseFloat(high), cur = parseFloat(current);
  if (isNaN(lo) || isNaN(hi) || isNaN(cur) || hi === lo) return null;
  const pct = Math.min(Math.max(((cur - lo) / (hi - lo)) * 100, 0), 100);
  return (
    <div className="mt-5">
      <div className="flex justify-between text-xs text-slate-500 mb-1.5">
        <span>52W Low {fmt(low)}</span>
        <span className="text-slate-300 font-medium">Now {fmt(current)}</span>
        <span>52W High {fmt(high)}</span>
      </div>
      <div className="relative h-2 bg-slate-800 rounded-full">
        <div
          className="absolute top-0 left-0 h-2 rounded-full bg-gradient-to-r from-red-600 via-amber-500 to-emerald-500"
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-white border-2 border-blue-400 rounded-full shadow"
          style={{ left: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-slate-500 mt-1.5 text-center">
        {pct.toFixed(0)}% of the way up from yearly low to high
      </p>
    </div>
  );
}

/* ── Earnings bar chart ───────────────────────────────────────────────── */
function EarningsChart({ earnings }) {
  if (!earnings?.quarterly?.length) return null;
  const quarters = [...earnings.quarterly].reverse().slice(0, 6);
  const max = Math.max(...quarters.map(q => Math.abs(q.reported ?? 0)), 0.01);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">
      <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
        <span>📊</span> Earnings Per Share — Last {quarters.length} Quarters
      </h3>
      <p className="text-xs text-slate-500 mb-5">
        EPS = profit per share of stock. Green bar = beat analyst estimate. Dot colour = beat (green) or missed (red).
      </p>
      <div className="flex items-end gap-2 h-28">
        {quarters.map((q, i) => {
          const val = q.reported ?? 0;
          const pct = Math.min(Math.abs(val) / max, 1);
          const barH = Math.max(pct * 96, 4);
          const beat = q.surprise !== null ? q.surprise > 0 : null;

          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
              {/* Hover tooltip */}
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs w-40 hidden group-hover:block z-10 shadow-xl pointer-events-none">
                <p className="text-white font-semibold">${val?.toFixed(2) ?? 'N/A'} EPS</p>
                {beat !== null && (
                  <p className={beat ? 'text-emerald-400' : 'text-red-400'}>
                    {beat ? '✓ Beat' : '✗ Missed'} by {Math.abs(q.surprisePercent ?? 0).toFixed(1)}%
                  </p>
                )}
                <p className="text-slate-500 mt-0.5">{q.date}</p>
              </div>

              <div
                style={{ height: barH }}
                className={`w-full rounded-t-sm ${
                  val >= 0
                    ? beat === true ? 'bg-emerald-500' : beat === false ? 'bg-emerald-800' : 'bg-emerald-600'
                    : 'bg-red-600'
                }`}
              />
              {beat !== null && (
                <div className={`w-1.5 h-1.5 rounded-full ${beat ? 'bg-emerald-400' : 'bg-red-400'}`} />
              )}
              <p className="text-xs text-slate-600 text-center leading-tight">
                {q.date?.slice(2, 7)}
              </p>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Beat estimates</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-800 inline-block" /> Missed estimates</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-600 inline-block" /> Negative EPS (loss)</span>
      </div>
    </div>
  );
}

/* ── SEC Filings section ──────────────────────────────────────────────── */
function FilingsSection({ symbol }) {
  const navigate = useNavigate();
  const [filings, setFilings] = useState(null);
  const [error, setError]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`/api/filings/${symbol}`)
      .then(r => setFilings(r.data))
      .catch(e => setError(e.response?.data?.error || 'Could not load SEC filings.'))
      .finally(() => setLoading(false));
  }, [symbol]);

  const FORM_BADGE = {
    '10-K': 'bg-blue-900/50 text-blue-300 border-blue-800',
    '10-Q': 'bg-indigo-900/50 text-indigo-300 border-indigo-800',
    '8-K':  'bg-slate-800 text-slate-400 border-slate-700',
  };

  return (
    <div className="mb-8">
      <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
        <span>📁</span> SEC Filings
      </h3>
      <p className="text-xs text-slate-500 mb-4">
        Official reports filed with the US Securities & Exchange Commission.
        <strong className="text-slate-400"> 10-K</strong> = annual report, <strong className="text-slate-400">10-Q</strong> = quarterly report,
        <strong className="text-slate-400"> 8-K</strong> = major event disclosure.
        Click <em>AI Analyze</em> to open a full breakdown with the source document highlighted.
      </p>

      {loading && <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>}

      {error && <p className="text-slate-500 text-sm">{error}</p>}

      {/* Loaded, but no filings array (unknown company, OTC, or non-JSON response) */}
      {!loading && !error && !(Array.isArray(filings?.filings) && filings.filings.length > 0) && (
        <p className="text-slate-500 text-sm">
          No recent SEC filings found for this security.
          {filings?.edgarUrl && (
            <> — <a href={filings.edgarUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">search SEC EDGAR ↗</a></>
          )}
        </p>
      )}

      {!loading && Array.isArray(filings?.filings) && filings.filings.length > 0 && (
        <div className="space-y-2">
          {filings.filings.slice(0, 8).map((f, i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-bold px-2 py-1 rounded border ${FORM_BADGE[f.form] || FORM_BADGE['8-K']}`}>
                    {f.form}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-slate-300">{f.label}</p>
                    <p className="text-xs text-slate-500">Filed {f.date}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a href={f.docUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white px-3 py-1.5 rounded-lg transition">
                    ↓ Download
                  </a>
                  {['10-K', '10-Q'].includes(f.form) && (
                    <button
                      onClick={() => navigate('/filing', { state: { symbol, filing: f } })}
                      className="text-xs bg-blue-600 hover:bg-blue-500 text-white font-medium px-3 py-1.5 rounded-lg transition flex items-center gap-1.5">
                      🤖 AI Analyze →
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          <a href={filings.edgarUrl} target="_blank" rel="noopener noreferrer"
            className="block text-center text-xs text-slate-500 hover:text-blue-400 transition py-2">
            View all filings on SEC EDGAR ↗
          </a>
        </div>
      )}
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────────────────── */
export default function StockDetail() {
  const { symbol }  = useParams();
  const location    = useLocation();
  const sym         = symbol.toUpperCase();
  const { addToWatchlist, removeFromWatchlist, isWatched } = useWatchlist();
  const { user } = useAuth();
  const [watchToast, setWatchToast] = useState('');

  function toggleWatchlist() {
    if (isWatched(sym)) {
      removeFromWatchlist(sym);
      setWatchToast(`Removed ${sym} from watchlist`);
    } else {
      const res = addToWatchlist({ symbol: sym, name: overview?.Name || sym });
      setWatchToast(res.ok ? `✓ ${sym} added to watchlist` : res.reason);
    }
    setTimeout(() => setWatchToast(''), 2500);
  }

  // Read movement context from URL (set by StockCard when navigating from dashboard)
  const params      = new URLSearchParams(location.search);
  const fromList    = params.get('from');    // 'gainers' | 'losers' | null
  const changeToday = params.get('change');  // e.g. '+194.58%'
  const market      = params.get('market');  // 'ngx' for Nigerian Exchange
  const isNGX       = market === 'ngx';

  const [quote, setQuote]         = useState(null);
  const [overview, setOverview]   = useState(null);
  const [news, setNews]           = useState([]);
  const [earnings, setEarnings]   = useState(null);
  const [fmpData, setFmpData]       = useState(null);
  const [finnhubData, setFinnhubData] = useState(null);
  const [chartInsight, setChartInsight] = useState(null);
  const [chartLoading, setChartLoading] = useState(true);
  const [aiSummary, setAiSummary] = useState(null);
  const [aiLoading, setAiLoading] = useState(true);
  const [aiError, setAiError]     = useState(null);
  const [loadingQuote, setLoadingQuote] = useState(true);
  const [quoteError, setQuoteError]     = useState(null);
  const [missingKeys, setMissingKeys]   = useState(null); // { finnhub, fmp } when data absent

  useEffect(() => {
    setLoadingQuote(true);
    setAiLoading(true);
    setAiSummary(null);
    setAiError(null);
    setQuoteError(null);
    setEarnings(null);
    setFmpData(null);
    setFinnhubData(null);
    setMissingKeys(null);

    const fetchAll = async () => {
      try {
        const [quoteRes, overviewRes, newsRes, earningsRes, finnhubRes] = await Promise.allSettled([
          axios.get(`/api/stock/${sym}/quote`),
          axios.get(`/api/stock/${sym}/overview`),
          axios.get(`/api/stock/${sym}/news`),
          axios.get(`/api/stock/${sym}/earnings`),
          axios.get(`/api/finnhub/${sym}`),   // everything: financials, news, analyst, insider, metrics (60/min free)
        ]);

        const quoteData    = quoteRes.status    === 'fulfilled' ? quoteRes.value.data    : null;
        const overviewData = overviewRes.status === 'fulfilled' ? overviewRes.value.data : null;
        const newsData     = newsRes.status     === 'fulfilled' ? newsRes.value.data     : [];
        const earningsData = earningsRes.status === 'fulfilled' ? earningsRes.value.data : null;
        const finnhubRaw   = finnhubRes.status  === 'fulfilled' ? finnhubRes.value.data  : null;
        // Financial statements now come from Finnhub (FMP free tier was discontinued)
        const fmpRaw       = finnhubRaw?.financials
          ? { ...finnhubRaw.financials, valuation: finnhubRaw.valuation }
          : null;

        // ── CRITICAL FIX: NEVER block the page ───────────────────────────
        // The TradingView chart loads independently and always works.
        // Show whatever data we have; set a soft warning only when everything failed.
        setQuote(quoteData);
        setOverview(overviewData);
        setNews(newsData || []);
        setEarnings(earningsData);
        setFinnhubData(finnhubRaw);
        setFmpData(fmpRaw);

        // If financial data is missing, check whether the Finnhub key is configured
        // so we can tell the user exactly what to do instead of showing an empty page.
        // (Skip for Nigerian stocks — Finnhub doesn't cover NGX, that's expected.)
        if (!finnhubRaw && !isNGX) {
          axios.get('/api/health/keys')
            .then(r => {
              if (!r.data.finnhub) setMissingKeys({ finnhub: true });
            })
            .catch(() => {});
        }
        setLoadingQuote(false);

        // Soft warning — shown as a banner, not a page-blocker
        if (!quoteData && !overviewData) {
          setQuoteError(
            newsData?.length
              ? 'Market data temporarily unavailable (API limit). Chart and news still load normally.'
              : 'Limited data found. This may be a warrant, SPAC, or OTC security. Chart still loads below.'
          );
        }

        // AI analysis now comes from the local StockSense engine bundled with the
        // Finnhub data — instant, free, no API limit, available to everyone.
        setAiSummary(finnhubRaw?.explanation || null);
        setAiLoading(false);
      } catch {
        setQuoteError('Failed to load stock data. Please try again.');
        setLoadingQuote(false);
        setAiLoading(false);
      }
    };

    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sym]);

  // Chart-reading engine — loads independently so it never delays the page.
  useEffect(() => {
    setChartInsight(null);
    setChartLoading(true);
    axios.get(`/api/yahoo/${sym}/chart`)
      .then(r => setChartInsight(r.data))
      .catch(() => setChartInsight(null))
      .finally(() => setChartLoading(false));
  }, [sym]);

  const isPositive = (quote?.change ?? 0) >= 0;

  return (
    <div>
      {/* Watchlist toast */}
      {watchToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-slate-800 border border-slate-700 text-white text-sm px-4 py-2 rounded-full shadow-xl">
          {watchToast}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white transition">
          ← Back to Market Overview
        </Link>
        <button
          onClick={toggleWatchlist}
          className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border transition ${
            isWatched(sym)
              ? 'bg-amber-900/30 border-amber-700 text-amber-400 hover:bg-red-900/30 hover:border-red-700 hover:text-red-400'
              : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-blue-600 hover:text-white'
          }`}
        >
          {isWatched(sym) ? '⭐ Watching' : '☆ Add to Watchlist'}
        </button>
      </div>

      {/* Soft API warning — page still loads, chart always works */}
      {quoteError && !loadingQuote && (
        <div className="mb-4 bg-amber-950/30 border border-amber-800/50 rounded-xl px-4 py-3 flex items-start gap-2">
          <span className="text-amber-500 shrink-0">⚠️</span>
          <p className="text-amber-300 text-sm">{quoteError}</p>
        </div>
      )}

      {/* Missing API keys — financial data won't load without them */}
      {missingKeys && !loadingQuote && (
        <div className="mb-4 bg-blue-950/30 border border-blue-800/50 rounded-xl px-5 py-4">
          <p className="text-blue-300 font-semibold text-sm mb-1.5">
            🔌 Connect free data sources for full financials
          </p>
          <p className="text-slate-400 text-xs leading-relaxed mb-2">
            Financial statements, dividends, analyst ratings, insider trades, and news all come from
            <strong className="text-white"> Finnhub</strong> (free — 60 requests/minute). The chart, AI summary,
            and SEC filings work without it.
          </p>
          <ul className="text-xs text-slate-400 space-y-1 mb-2">
            <li>• Get a free key at{' '}
              <a href="https://finnhub.io" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">finnhub.io</a>{' '}
              → add <code className="bg-slate-800 px-1 rounded">FINNHUB_API_KEY</code> to <code className="bg-slate-800 px-1 rounded">backend/.env</code>
            </li>
          </ul>
          <p className="text-slate-500 text-xs">Then <strong className="text-slate-300">restart the server</strong> — editing .env doesn't reload a running server.</p>
        </div>
      )}

      {/* Nigerian Exchange banner */}
      {isNGX && (
        <div className="mb-4 bg-green-950/30 border border-green-800/50 rounded-xl px-5 py-3 flex items-start gap-3">
          <span className="text-xl shrink-0">🇳🇬</span>
          <div>
            <p className="text-green-300 font-semibold text-sm">Nigerian Exchange (NGX) listed</p>
            <p className="text-slate-400 text-xs mt-0.5">
              Price chart and AI summary work for NGX stocks. Detailed financial statements
              (income/balance/cash flow) are US-market only for now — refer to the company's
              annual report on <a href="https://ngxgroup.com" target="_blank" rel="noopener noreferrer" className="text-green-400 hover:underline">ngxgroup.com</a> for full filings.
            </p>
          </div>
        </div>
      )}

      {/* Movement context banner */}
      <MovementBanner from={fromList} changeToday={changeToday} />

      {/* ── Stock hero ── */}
      {loadingQuote ? (
        <div className="mb-8 space-y-3">
          <div className="skeleton h-10 w-64" />
          <div className="skeleton h-12 w-48" />
          <div className="skeleton h-2 w-full rounded-full mt-4" />
        </div>
      ) : (
        <div className="mb-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0">
              <StockLogo symbol={sym} name={overview?.Name} src={finnhubData?.profile?.logo} size={56} />
              <div className="min-w-0">
              <div className="flex items-center gap-3 mb-1 flex-wrap">
                <h1 className="text-4xl font-black text-white">{sym}</h1>
                {overview?.Exchange && (
                  <span className="text-xs bg-slate-800 border border-slate-700 text-slate-400 px-2 py-1 rounded-md">
                    {overview.Exchange}
                  </span>
                )}
                {/* Warn if no company data */}
                {!overview?.Name && (
                  <span className="text-xs bg-amber-900/40 border border-amber-800 text-amber-400 px-2 py-1 rounded-md">
                    Limited data available
                  </span>
                )}
              </div>
              {overview?.Name ? (
                <p className="text-slate-300 text-xl font-semibold">{overview.Name}</p>
              ) : (
                <p className="text-slate-500 text-sm">
                  Company info not available — this may be a warrant, SPAC unit, or OTC security.
                </p>
              )}
              {overview?.Sector && (
                <p className="text-slate-500 text-sm mt-0.5">
                  {overview.Sector} · {overview.Industry}
                </p>
              )}
              </div>
            </div>

            <div className="text-right">
              {quote?.price ? (
                <>
                  <p className="text-4xl font-black text-white">{fmt(quote.price)}</p>
                  <p className={`text-sm font-semibold mt-1 ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                    {isPositive ? '▲' : '▼'} {isPositive ? '+' : ''}${Math.abs(quote.change ?? 0).toFixed(4)} ({quote.changePercent})
                  </p>
                  {quote.tradingDay && (
                    <p className="text-xs text-slate-600 mt-0.5">As of {quote.tradingDay}</p>
                  )}
                </>
              ) : changeToday ? (
                <p className={`text-2xl font-bold ${fromList === 'gainers' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {changeToday} today
                </p>
              ) : null}
            </div>
          </div>

          {/* 52-week range */}
          <RangeBar
            low={overview?.['52WeekLow']}
            high={overview?.['52WeekHigh']}
            current={quote?.price}
          />

          {/* Key stats — only if we have data */}
          {(quote || overview) && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 mt-5">
                <Stat label="Open"       value={fmt(quote?.open)} />
                <Stat label="Day High"   value={fmt(quote?.high)} />
                <Stat label="Day Low"    value={fmt(quote?.low)} />
                <Stat label="Market Cap" value={fmtLarge(overview?.MarketCapitalization)} />
                <Stat label="P/E Ratio"  value={overview?.PERatio || 'N/A'} sub="Price vs Earnings" />
                <Stat label="Beta"       value={overview?.Beta || 'N/A'} sub="Volatility vs market" />
              </div>
              {!quote?.open && (
                <p className="text-xs text-slate-500 mt-3 flex items-start gap-1.5">
                  <span className="text-amber-500 shrink-0">ℹ️</span>
                  Live intraday figures (open, day high/low) aren't available for this stock right now — that's normal for some tickers and after-hours. The chart, health score, and AI breakdown below still work.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* ── StockSense Intelligence — local quant model, free for everyone ── */}
      <IntelligencePanel intel={finnhubData?.intelligence} />

      {/* ── TradingView chart — always shown ── */}
      <TradingViewChart
        symbol={sym}
        exchange={overview?.Exchange}
        market={market}
      />

      {/* ── Chart-reading AI — explains the price action above (local, no Claude) ── */}
      <ChartInsight data={chartInsight} loading={chartLoading} />

      {/* ── AI Analysis — local StockSense engine, free for everyone (no API limit) ── */}
      <div className="mb-8">
        <AISummary data={aiSummary} loading={aiLoading} error={aiError} />
      </div>

      {/* ── Earnings chart ── */}
      {earnings && <EarningsChart earnings={earnings} />}

      {/* ── Company description ── */}
      {overview?.Description && (
        <div className="mb-8 bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
            About {overview.Name}
          </h3>
          <p className="text-slate-300 text-sm leading-relaxed">{overview.Description}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-slate-800">
            <div>
              <p className="text-xs text-slate-500">EPS (last 12 mo)</p>
              <p className="text-sm font-semibold text-white mt-0.5">{overview.EPS ? `$${overview.EPS}` : 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Revenue (TTM)</p>
              <p className="text-sm font-semibold text-white mt-0.5">{fmtLarge(overview.RevenueTTM)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Profit Margin</p>
              <p className="text-sm font-semibold text-white mt-0.5">{fmtPct(overview.ProfitMargin)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Analyst Target</p>
              <p className="text-sm font-semibold text-white mt-0.5">{fmt(overview.AnalystTargetPrice)}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Financial Statements (FMP — 250/day free) ── */}
      {(fmpData?.incomeStatement?.annual?.length > 0 || fmpData?.balanceSheet?.annual?.length > 0) && (
        <div className="mb-8 space-y-3">
          <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
            <span>📊</span> Financial Statements
            <span className="text-xs text-slate-500 font-normal ml-1">Click a section to expand · tap AI Breakdown for plain-English analysis</span>
          </h3>

          <FinancialSection
            title="Income Statement"
            icon="💰"
            section="incomeStatement"
            annualData={fmpData?.incomeStatement?.annual}
            quarterlyData={fmpData?.incomeStatement?.quarterly}
            metrics={fmpData?.valuation}
            symbol={sym}
            companyName={overview?.Name}
          />

          <FinancialSection
            title="Balance Sheet"
            icon="🏦"
            section="balanceSheet"
            annualData={fmpData?.balanceSheet?.annual}
            quarterlyData={fmpData?.balanceSheet?.quarterly}
            metrics={fmpData?.valuation}
            symbol={sym}
            companyName={overview?.Name}
          />

          <FinancialSection
            title="Cash Flow Statement"
            icon="💸"
            section="cashFlow"
            annualData={fmpData?.cashFlow?.annual}
            quarterlyData={fmpData?.cashFlow?.quarterly}
            metrics={fmpData?.valuation}
            symbol={sym}
            companyName={overview?.Name}
          />
        </div>
      )}

      {/* ── Analyst Ratings, Dividends & Insider Trades ── */}
      {(finnhubData || fmpData) && (
        <div className="mb-8 space-y-4">

          {/* Analyst consensus from Finnhub */}
          {finnhubData?.analystRatings?.[0] && (() => {
            const r = finnhubData.analystRatings[0];
            const total = r.total || 1;
            const bullPct = Math.round(((r.strongBuy + r.buy) / total) * 100);
            const holdPct = Math.round((r.hold / total) * 100);
            const bearPct = Math.round(((r.sell + r.strongSell) / total) * 100);
            return (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                  <span>📋</span> Analyst Ratings
                  <span className="text-xs text-slate-500 font-normal ml-1">from {total} analysts · {r.period}</span>
                </h4>
                <div className="flex gap-2 mb-3 h-4 rounded-full overflow-hidden">
                  {bullPct > 0 && <div style={{ width: `${bullPct}%` }} className="bg-emerald-500 transition-all" title={`Buy: ${bullPct}%`} />}
                  {holdPct > 0 && <div style={{ width: `${holdPct}%` }} className="bg-amber-500 transition-all" title={`Hold: ${holdPct}%`} />}
                  {bearPct > 0 && <div style={{ width: `${bearPct}%` }} className="bg-red-500 transition-all" title={`Sell: ${bearPct}%`} />}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center"><p className="text-xl font-black text-emerald-400">{r.strongBuy + r.buy}</p><p className="text-xs text-slate-500">Buy ({bullPct}%)</p></div>
                  <div className="text-center"><p className="text-xl font-black text-amber-400">{r.hold}</p><p className="text-xs text-slate-500">Hold ({holdPct}%)</p></div>
                  <div className="text-center"><p className="text-xl font-black text-red-400">{r.sell + r.strongSell}</p><p className="text-xs text-slate-500">Sell ({bearPct}%)</p></div>
                </div>
                {finnhubData.metrics?.high52w && (
                  <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { l: 'P/E Ratio',   v: finnhubData.metrics.peRatio    },
                      { l: 'P/B Ratio',   v: finnhubData.metrics.pbRatio    },
                      { l: 'Div. Yield',  v: finnhubData.metrics.divYield   },
                      { l: 'ROE (TTM)',   v: finnhubData.metrics.roeTTM     },
                    ].map(({ l, v }) => v && (
                      <div key={l}><p className="text-xs text-slate-500">{l}</p><p className="text-sm font-semibold text-white">{v}</p></div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Dividends — from Finnhub */}
          {finnhubData?.dividend?.hasDividend && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                <span>💵</span> Dividends
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {finnhubData.dividend.yield && (
                  <div>
                    <p className="text-xs text-slate-500">Dividend Yield</p>
                    <p className="text-lg font-bold text-emerald-400 mt-0.5">{finnhubData.dividend.yield}</p>
                  </div>
                )}
                {finnhubData.dividend.perShare && (
                  <div>
                    <p className="text-xs text-slate-500">Annual Per Share</p>
                    <p className="text-lg font-bold text-white mt-0.5">${finnhubData.dividend.perShare}</p>
                  </div>
                )}
                {finnhubData.dividend.growthRate && (
                  <div>
                    <p className="text-xs text-slate-500">5Y Growth Rate</p>
                    <p className="text-lg font-bold text-white mt-0.5">{finnhubData.dividend.growthRate}%</p>
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-3">
                {sym} pays a dividend — a share of profits paid to shareholders, usually quarterly.
                The yield is the annual dividend as a % of the share price.
              </p>
            </div>
          )}

          {/* Insider Trades — from Finnhub */}
          {finnhubData?.insiderTrades?.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                <span>🏢</span> Insider Trades
                <span className="text-xs text-slate-500 font-normal ml-1">executives buying/selling their own company's stock</span>
              </h4>
              <div className="space-y-2">
                {finnhubData.insiderTrades.slice(0, 6).map((t, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0 gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded shrink-0 ${t.type === 'BUY' ? 'bg-emerald-900/50 text-emerald-400' : 'bg-red-900/50 text-red-400'}`}>
                        {t.type || '?'}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm text-white font-medium truncate">{t.name}</p>
                        <p className="text-xs text-slate-500">{t.transactionDate}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-white">{t.value || '—'}</p>
                      <p className="text-xs text-slate-500">{Math.abs(t.shares || 0).toLocaleString()} shares</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-600 mt-3">
                Heavy insider <span className="text-emerald-500">buying</span> = executives confident in the company.
                Heavy <span className="text-red-500">selling</span> = could be routine, or a bearish signal.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── SEC Filings ── */}
      <FilingsSection symbol={sym} />

      {/* ── News (Finnhub + Alpha Vantage) ── */}
      {(news.length > 0 || finnhubData?.news?.length > 0) && (
        <div className="mb-8">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <span>📰</span> Recent News
            <span className="text-xs text-slate-500 font-normal">Finnhub + Alpha Vantage</span>
          </h3>

          {/* Finnhub news — richer coverage, thumbnails */}
          {finnhubData?.news?.length > 0 && (
            <div className="space-y-2 mb-3">
              {finnhubData.news.slice(0, 10).map((article, i) => (
                <a key={`fh-${i}`} href={article.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-start gap-3 bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-xl p-4 transition group">
                  {article.image && (
                    <img src={article.image} alt="" className="w-16 h-12 object-cover rounded-lg shrink-0 bg-slate-800" onError={e => e.target.style.display='none'} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-200 group-hover:text-white leading-snug line-clamp-2">{article.headline}</p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-xs text-slate-500">{article.source}</span>
                      {article.category && <span className="text-xs bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded">{article.category}</span>}
                      {article.publishedAt && (
                        <><span className="text-slate-700">·</span>
                        <span className="text-xs text-slate-600">{new Date(article.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></>
                      )}
                      <span className="ml-auto text-xs text-blue-500 group-hover:text-blue-300 shrink-0">Read →</span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}

          {/* Alpha Vantage news with sentiment labels */}
          {news.length > 0 && (
            <div className="space-y-3">
              {news.map((article, i) => (
                <NewsCard key={`av-${i}`} article={article} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* No data at all — helpful message */}
      {!loadingQuote && !quote && !overview?.Name && news.length === 0 && (
        <div className="bg-slate-900 border border-amber-900/40 rounded-2xl p-6 text-center">
          <p className="text-amber-400 font-semibold mb-2">⚠️ Very Limited Data Available</p>
          <p className="text-slate-400 text-sm leading-relaxed mb-4">
            No financial data, news, or company information could be found for <strong>{sym}</strong>.
            This is common for warrants (tickers ending in W), SPAC units, rights, and some OTC securities.
            These are significantly higher risk than regular stocks.
          </p>
          <a
            href={`https://finance.yahoo.com/quote/${sym}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-sm text-blue-400 hover:underline mr-4"
          >
            Yahoo Finance ↗
          </a>
          <a
            href={`https://www.sec.gov/cgi-bin/browse-edgar?company=&CIK=${sym}&type=10-K&action=getcompany`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-sm text-blue-400 hover:underline"
          >
            SEC EDGAR ↗
          </a>
        </div>
      )}
    </div>
  );
}
