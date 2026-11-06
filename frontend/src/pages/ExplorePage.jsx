import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import axios from 'axios';

/* ── Nigerian Exchange section ─────────────────────────────────────────── */
function NGXSection() {
  const navigate = useNavigate();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/ngx/movers')
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  // NGX stocks route with ?market=ngx so the chart uses the NSENG prefix
  const goNGX = (symbol) => navigate(`/stock/${symbol}?market=ngx`);

  // Group curated companies by sector
  const companies = data?.companies || [];
  const bySector = companies.reduce((acc, c) => {
    (acc[c.sector] = acc[c.sector] || []).push(c);
    return acc;
  }, {});

  return (
    <section className="mb-12">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">🇳🇬</span>
        <div>
          <h2 className="text-lg font-bold text-white">Nigerian Exchange (NGX)</h2>
          <p className="text-xs text-slate-500">
            {data?.live ? 'Live movers from the Nigerian Exchange' : 'Major companies listed on the NGX'}
          </p>
        </div>
      </div>

      {loading && <div className="skeleton h-40 rounded-2xl" />}

      {/* Live movers — gainers + losers */}
      {!loading && data?.live && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-3">🚀 Top Gainers</p>
            <div className="space-y-1">
              {(data.gainers || []).slice(0, 6).map(s => (
                <button key={s.ticker} onClick={() => goNGX(s.ticker)}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-800 transition group">
                  <span className="text-sm text-slate-300 group-hover:text-white truncate">{s.ticker}</span>
                  <span className="text-xs text-emerald-400 font-semibold shrink-0">{s.change_percentage}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <p className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3">📉 Top Losers</p>
            <div className="space-y-1">
              {(data.losers || []).slice(0, 6).map(s => (
                <button key={s.ticker} onClick={() => goNGX(s.ticker)}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-800 transition group">
                  <span className="text-sm text-slate-300 group-hover:text-white truncate">{s.ticker}</span>
                  <span className="text-xs text-red-400 font-semibold shrink-0">{s.change_percentage}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Curated companies by sector */}
      {!loading && Object.keys(bySector).length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          {!data?.live && data?.message && (
            <p className="text-xs text-slate-500 mb-3">{data.message}</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
            {Object.entries(bySector).map(([sector, stocks]) => (
              <div key={sector}>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{sector}</p>
                {stocks.map(s => (
                  <button key={s.symbol} onClick={() => goNGX(s.symbol)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-800 transition group text-left">
                    <span className="bg-slate-800 text-green-300 text-xs font-bold px-2 py-0.5 rounded min-w-[80px] text-center shrink-0">{s.symbol}</span>
                    <span className="text-sm text-slate-400 group-hover:text-white transition truncate">{s.name}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

const SECTORS = [
  {
    name: 'Technology',
    icon: '💻',
    desc: 'Software, hardware, semiconductors, and the internet',
    stocks: [
      { symbol: 'AAPL', name: 'Apple' },
      { symbol: 'MSFT', name: 'Microsoft' },
      { symbol: 'NVDA', name: 'NVIDIA' },
      { symbol: 'GOOGL', name: 'Alphabet (Google)' },
      { symbol: 'META', name: 'Meta' },
      { symbol: 'AMD', name: 'AMD' },
      { symbol: 'INTC', name: 'Intel' },
      { symbol: 'ORCL', name: 'Oracle' },
      { symbol: 'ADBE', name: 'Adobe' },
      { symbol: 'CRM', name: 'Salesforce' },
      { symbol: 'PLTR', name: 'Palantir' },
      { symbol: 'ARM', name: 'Arm Holdings' },
    ],
  },
  {
    name: 'Consumer & Retail',
    icon: '🛍️',
    desc: 'Everyday brands, retail, entertainment',
    stocks: [
      { symbol: 'AMZN', name: 'Amazon' },
      { symbol: 'TSLA', name: 'Tesla' },
      { symbol: 'NKE', name: 'Nike' },
      { symbol: 'MCD', name: "McDonald's" },
      { symbol: 'SBUX', name: 'Starbucks' },
      { symbol: 'COST', name: 'Costco' },
      { symbol: 'WMT', name: 'Walmart' },
      { symbol: 'TGT', name: 'Target' },
      { symbol: 'DIS', name: 'Disney' },
      { symbol: 'NFLX', name: 'Netflix' },
      { symbol: 'SPOT', name: 'Spotify' },
      { symbol: 'UBER', name: 'Uber' },
    ],
  },
  {
    name: 'Finance & Banking',
    icon: '🏦',
    desc: 'Banks, payments, insurance, investment firms',
    stocks: [
      { symbol: 'JPM', name: 'JPMorgan Chase' },
      { symbol: 'BAC', name: 'Bank of America' },
      { symbol: 'GS', name: 'Goldman Sachs' },
      { symbol: 'MS', name: 'Morgan Stanley' },
      { symbol: 'V', name: 'Visa' },
      { symbol: 'MA', name: 'Mastercard' },
      { symbol: 'AXP', name: 'American Express' },
      { symbol: 'PYPL', name: 'PayPal' },
      { symbol: 'BRK.B', name: 'Berkshire Hathaway' },
      { symbol: 'BLK', name: 'BlackRock' },
      { symbol: 'COIN', name: 'Coinbase' },
      { symbol: 'SQ', name: 'Block (Square)' },
    ],
  },
  {
    name: 'Healthcare & Biotech',
    icon: '🏥',
    desc: 'Pharmaceuticals, biotech, medical devices',
    stocks: [
      { symbol: 'JNJ', name: 'Johnson & Johnson' },
      { symbol: 'UNH', name: 'UnitedHealth' },
      { symbol: 'LLY', name: 'Eli Lilly' },
      { symbol: 'PFE', name: 'Pfizer' },
      { symbol: 'ABBV', name: 'AbbVie' },
      { symbol: 'MRK', name: 'Merck' },
      { symbol: 'MRNA', name: 'Moderna' },
      { symbol: 'AMGN', name: 'Amgen' },
      { symbol: 'GILD', name: 'Gilead Sciences' },
      { symbol: 'BMY', name: 'Bristol-Myers' },
      { symbol: 'REGN', name: 'Regeneron' },
      { symbol: 'ISRG', name: 'Intuitive Surgical' },
    ],
  },
  {
    name: 'Energy',
    icon: '⛽',
    desc: 'Oil, gas, renewables, utilities',
    stocks: [
      { symbol: 'XOM', name: 'Exxon Mobil' },
      { symbol: 'CVX', name: 'Chevron' },
      { symbol: 'COP', name: 'ConocoPhillips' },
      { symbol: 'SLB', name: 'SLB (Schlumberger)' },
      { symbol: 'OXY', name: 'Occidental' },
      { symbol: 'VLO', name: 'Valero Energy' },
      { symbol: 'NEE', name: 'NextEra Energy' },
      { symbol: 'ENPH', name: 'Enphase Energy' },
    ],
  },
  {
    name: 'Industrials & Aerospace',
    icon: '✈️',
    desc: 'Manufacturing, defence, aerospace, logistics',
    stocks: [
      { symbol: 'BA', name: 'Boeing' },
      { symbol: 'CAT', name: 'Caterpillar' },
      { symbol: 'GE', name: 'GE Aerospace' },
      { symbol: 'RTX', name: 'RTX (Raytheon)' },
      { symbol: 'LMT', name: 'Lockheed Martin' },
      { symbol: 'UPS', name: 'UPS' },
      { symbol: 'FDX', name: 'FedEx' },
      { symbol: 'HON', name: 'Honeywell' },
    ],
  },
];

const TRENDING = [
  { symbol: 'NVDA', name: 'NVIDIA', tag: 'AI Boom' },
  { symbol: 'TSLA', name: 'Tesla', tag: 'EV + Robotics' },
  { symbol: 'PLTR', name: 'Palantir', tag: 'AI + Gov\'t data' },
  { symbol: 'META', name: 'Meta', tag: 'AI + Ads' },
  { symbol: 'ARM', name: 'Arm Holdings', tag: 'Chip architecture' },
  { symbol: 'MRNA', name: 'Moderna', tag: 'mRNA pipeline' },
  { symbol: 'COIN', name: 'Coinbase', tag: 'Crypto regulation' },
  { symbol: 'AAPL', name: 'Apple', tag: 'Apple Intelligence' },
];

function StockRow({ symbol, name, onClick }) {
  return (
    <button
      onClick={() => onClick(symbol)}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-800 transition group w-full text-left"
    >
      <span className="bg-slate-800 group-hover:bg-slate-700 text-blue-300 text-xs font-bold px-2 py-1 rounded min-w-[52px] text-center transition">
        {symbol}
      </span>
      <span className="text-sm text-slate-400 group-hover:text-white transition truncate">{name}</span>
      <span className="ml-auto text-slate-600 group-hover:text-blue-400 transition text-xs shrink-0">→</span>
    </button>
  );
}

export default function ExplorePage() {
  const navigate = useNavigate();
  const go = (symbol) => navigate(`/stock/${symbol}`);

  return (
    <div>
      {/* Hero */}
      <div className="mb-10">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-2">🔭 Explore Stocks</h1>
        <p className="text-slate-400 text-sm">
          Browse by sector or pick from trending stocks. Click any to get the AI analysis.
        </p>
      </div>

      {/* Trending */}
      <section className="mb-12">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <span>🔥</span> Trending Now
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {TRENDING.map((s) => (
            <button
              key={s.symbol}
              onClick={() => go(s.symbol)}
              className="bg-slate-900 border border-slate-800 hover:border-blue-600 rounded-xl p-4 text-left transition group"
            >
              <p className="text-base font-bold text-white group-hover:text-blue-300 transition">{s.symbol}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.name}</p>
              <span className="inline-block mt-2 text-xs bg-blue-900/40 text-blue-400 border border-blue-800 px-2 py-0.5 rounded-full">
                {s.tag}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Nigerian Exchange */}
      <NGXSection />

      {/* US Sectors */}
      <div className="flex items-center gap-2 mb-4 mt-2">
        <span className="text-lg">🇺🇸</span>
        <h2 className="text-lg font-bold text-white">US Markets by Sector</h2>
      </div>
      {SECTORS.map((sector) => (
        <section key={sector.name} className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">{sector.icon}</span>
            <div>
              <h2 className="text-lg font-bold text-white">{sector.name}</h2>
              <p className="text-xs text-slate-500">{sector.desc}</p>
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-800">
              {[0, 1, 2].map((col) => (
                <div key={col} className="divide-y divide-slate-800/60 p-2">
                  {sector.stocks
                    .filter((_, i) => i % 3 === col)
                    .map((s) => (
                      <StockRow key={s.symbol} symbol={s.symbol} name={s.name} onClick={go} />
                    ))}
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
