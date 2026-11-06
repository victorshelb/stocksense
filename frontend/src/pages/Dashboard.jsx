import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import StockCard from '../components/StockCard.jsx';
import Logo from '../components/Logo.jsx';

/* Scroll-reveal wrapper — fades a section up the first time it enters view */
function Reveal({ children, className = '' }) {
  const ref = useRef(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVis(true); io.disconnect(); } },
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`reveal ${vis ? 'is-visible' : ''} ${className}`}>{children}</div>;
}

function CardSkeleton() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
      <div className="flex justify-between">
        <div className="skeleton h-5 w-16" />
        <div className="skeleton h-5 w-16" />
      </div>
      <div className="skeleton h-8 w-24" />
      <div className="skeleton h-3 w-20" />
    </div>
  );
}

function SectionHeader({ emoji, title, subtitle }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="text-2xl">{emoji}</span>
      <div>
        <h2 className="text-lg font-bold text-white">{title}</h2>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

function Grid({ items, listType, loading }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {loading
        ? Array.from({ length: 10 }).map((_, i) => <CardSkeleton key={i} />)
        : items.map((stock, i) => (
            <StockCard key={`${stock.ticker}-${i}`} stock={stock} listType={listType} index={i} />
          ))}
    </div>
  );
}

const asNgxStock = (c) => ({ ticker: c.symbol, name: c.name, sector: c.sector, price: null, change_percentage: null, market: 'ngx' });
const pctNum = (s) => parseFloat(String(s || '').replace('%', ''));

export default function Dashboard() {
  const [region, setRegion] = useState('us');        // 'us' | 'ng'
  const [view, setView]     = useState(null);         // normalised { gainers, losers, active, companies?, source, last_updated, live }
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState(null); // { needsKey } | { message } | null

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErrorState(null);
    setView(null);

    const load = region === 'us'
      ? axios.get('/api/market/overview').then(r => ({
          source: r.data.source, last_updated: r.data.last_updated, live: true,
          gainers: r.data.top_gainers || [], losers: r.data.top_losers || [], active: r.data.most_actively_traded || [],
        }))
      : axios.get('/api/ngx/movers').then(r => (
          r.data.live
            ? { source: r.data.source, last_updated: r.data.last_updated, live: true,
                gainers: (r.data.gainers || []).map(s => ({ ...s, market: 'ngx' })),
                losers:  (r.data.losers  || []).map(s => ({ ...s, market: 'ngx' })),
                active:  (r.data.active  || []).map(s => ({ ...s, market: 'ngx' })) }
            : { source: r.data.source, live: false, message: r.data.message,
                companies: (r.data.companies || []).map(asNgxStock), gainers: [], losers: [], active: [] }
        ));

    load
      .then(v => { if (alive) setView(v); })
      .catch(e => { if (alive) setErrorState({ needsKey: e.response?.data?.needsKey, message: e.response?.data?.error }); })
      .finally(() => { if (alive) setLoading(false); });

    return () => { alive = false; };
  }, [region]);

  // Ticker-tape items from the current movers
  const tickerItems = [...(view?.gainers || []), ...(view?.losers || [])]
    .filter(s => s.change_percentage)
    .slice(0, 24)
    .map(s => ({ ticker: s.ticker, up: pctNum(s.change_percentage) >= 0, pct: s.change_percentage, ccy: region === 'ng' ? '₦' : '$', price: s.price }));

  const RegionToggle = () => (
    <div className="mt-6 inline-flex items-center gap-1 bg-slate-800/80 border border-slate-700 rounded-full p-1">
      {[['us', '🇺🇸', 'US Market'], ['ng', '🇳🇬', 'Nigeria (NGX)']].map(([id, flag, label]) => (
        <button
          key={id}
          onClick={() => setRegion(id)}
          className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors flex items-center gap-1.5 ${
            region === id ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          <span>{flag}</span> {label}
        </button>
      ))}
    </div>
  );

  const Hero = () => (
    <div className="relative overflow-hidden rounded-3xl mb-8 px-6 sm:px-10 py-10 sm:py-14 border border-slate-800 bg-slate-900">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="animate-orb absolute -top-16 -left-10 w-64 h-64 rounded-full bg-blue-600/25 blur-3xl" />
        <div className="animate-orb absolute -bottom-24 right-0 w-72 h-72 rounded-full bg-emerald-500/20 blur-3xl" style={{ animationDelay: '2.5s' }} />
        <div className="animate-orb absolute top-10 right-1/3 w-40 h-40 rounded-full bg-indigo-500/20 blur-3xl" style={{ animationDelay: '4s' }} />
      </div>
      {/* decorative logo fills the empty right side of the hero */}
      <div className="pointer-events-none absolute right-8 lg:right-16 top-1/2 -translate-y-1/2 hidden md:block animate-orb" aria-hidden="true">
        <Logo size={150} withWordmark={false} className="opacity-90 drop-shadow-2xl" />
      </div>
      <div className="relative animate-fade-up">
        <span className="inline-flex mb-3"><Logo size={20} wordClass="text-sm" /></span>
        <h1 className="text-4xl sm:text-5xl font-black text-white leading-[1.05]">
          Today's{' '}
          <span className="animate-gradient bg-gradient-to-r from-blue-400 via-indigo-400 to-emerald-400 bg-clip-text text-transparent">
            Market
          </span>
        </h1>
        <p className="text-slate-400 text-sm sm:text-base mt-3 max-w-xl leading-relaxed">
          Tap any stock for a plain-English breakdown and a live health score — no finance background needed.
        </p>
        {view?.source && (
          <p className="text-slate-600 text-xs mt-2">
            Live via {view.source}
            {view.last_updated && <> · {new Date(view.last_updated).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}</>}
          </p>
        )}
        <RegionToggle />
      </div>
    </div>
  );

  return (
    <div>
      <Hero />

      {/* Live ticker tape */}
      {!loading && tickerItems.length > 0 && (
        <div className="marquee-mask overflow-hidden mb-10 border-y border-slate-800 py-2.5">
          <div className="flex gap-8 w-max animate-marquee">
            {[...tickerItems, ...tickerItems].map((t, i) => (
              <span key={i} className="inline-flex items-center gap-2 text-sm whitespace-nowrap">
                <span className="font-bold text-white">{t.ticker}</span>
                {t.price && <span className="text-slate-500 tabular-nums">{t.ccy}{parseFloat(t.price).toFixed(2)}</span>}
                <span className={t.up ? 'text-emerald-400' : 'text-red-400'}>{t.up ? '▲' : '▼'} {t.pct}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Error / needs-key state (US) */}
      {errorState && !loading && (
        <div className="mb-6 bg-amber-950/30 border border-amber-800/50 rounded-2xl px-5 py-4 flex items-start gap-3">
          <span className="text-amber-500 text-xl shrink-0">⚠️</span>
          <div>
            <p className="text-amber-300 font-semibold text-sm">
              {region === 'ng' ? 'Nigerian market data temporarily unavailable' : 'Market movers temporarily unavailable'}
            </p>
            <p className="text-slate-400 text-xs mt-1 leading-relaxed">
              {errorState.needsKey
                ? <>Add a free <code className="bg-slate-800 px-1 rounded">FINNHUB_API_KEY</code> to <code className="bg-slate-800 px-1 rounded">backend/.env</code> and restart for live movers.</>
                : 'You can still search any stock by name or ticker, or switch region above.'}
            </p>
          </div>
        </div>
      )}

      {/* NGX live-price notice (fallback to curated companies) */}
      {!loading && view && view.live === false && (
        <div className="mb-6 bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-3 text-sm text-slate-300">
          🇳🇬 {view.message || 'Showing major NGX-listed companies. Charts and analysis still work.'}
        </div>
      )}

      {/* Gainers */}
      {view?.gainers?.length > 0 && (
        <Reveal className="mb-12">
          <SectionHeader emoji="🚀" title="Top Gainers" subtitle="Stocks making the biggest jumps today" />
          <Grid items={view.gainers} listType="gainers" loading={loading} />
        </Reveal>
      )}

      {/* Losers */}
      {view?.losers?.length > 0 && (
        <Reveal className="mb-12">
          <SectionHeader emoji="📉" title="Top Losers" subtitle="Stocks taking the biggest hits today" />
          <Grid items={view.losers} listType="losers" loading={loading} />
        </Reveal>
      )}

      {/* Biggest movers (was "Most Active" — we don't have true volume, so label honestly) */}
      {view?.active?.length > 0 && (
        <Reveal className="mb-12">
          <SectionHeader emoji="🔥" title="Biggest Movers" subtitle="Largest swings in either direction today" />
          <Grid items={view.active} listType="active" loading={loading} />
        </Reveal>
      )}

      {/* NGX curated companies (fallback browse) */}
      {view?.companies?.length > 0 && (
        <Reveal className="mb-12">
          <SectionHeader emoji="🇳🇬" title="Major Nigerian Companies" subtitle="Browse NGX-listed stocks — tap for analysis" />
          <Grid items={view.companies} listType="ngx" loading={false} />
        </Reveal>
      )}

      {/* Loading skeletons for first paint */}
      {loading && (
        <section className="mb-12">
          <SectionHeader emoji="🚀" title="Top Gainers" subtitle="Loading live market data…" />
          <Grid items={[]} loading={true} />
        </section>
      )}

      {/* Explore CTA */}
      {!loading && (
        <div className="text-center py-10 border-t border-slate-800">
          <p className="text-slate-400 text-sm mb-4">Looking for a specific stock? Search any ticker worldwide, or browse by sector.</p>
          <a href="/explore" className="inline-block bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors">
            🔭 Explore All Sectors →
          </a>
        </div>
      )}
    </div>
  );
}
