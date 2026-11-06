import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import StockLogo from '../components/StockLogo.jsx';

export default function SearchPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const query = params.get('q') || '';

  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!query.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    axios.get(`/api/search?q=${encodeURIComponent(query)}`)
      .then(r => setResults(r.data || []))
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, [query]);

  return (
    <div className="max-w-3xl mx-auto">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white mb-6 transition">
        ← Back to Market Overview
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
          Search results for "<span className="text-blue-400">{query}</span>"
        </h1>
        {!loading && (
          <p className="text-slate-500 text-sm mt-1">
            {results.length > 0
              ? `${results.length} match${results.length === 1 ? '' : 'es'} — click any to see the AI analysis`
              : 'No matches found'}
          </p>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}
        </div>
      )}

      {/* Results list */}
      {!loading && results.length > 0 && (
        <div className="space-y-2">
          {results.map(r => (
            <button
              key={r.symbol}
              onClick={() => navigate(`/stock/${r.symbol}`)}
              className="w-full flex items-center gap-4 bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-blue-600 hover:bg-slate-800 transition text-left group"
            >
              <StockLogo symbol={r.symbol} name={r.name} size={44} />
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold text-white group-hover:text-blue-300 transition">{r.symbol}</p>
                <p className="text-sm text-slate-400 truncate">{r.name}</p>
              </div>
              {r.type && (
                <span className="text-xs text-slate-600 bg-slate-800 border border-slate-700 px-2 py-1 rounded-md shrink-0 hidden sm:block">
                  {r.type}
                </span>
              )}
              <span className="text-slate-600 group-hover:text-blue-400 transition shrink-0">→</span>
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && results.length === 0 && query.trim() && (
        <div className="text-center py-16 bg-slate-900/50 border border-slate-800 rounded-2xl">
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-white font-semibold">No stocks found for "{query}"</p>
          <p className="text-slate-400 text-sm mt-2 max-w-md mx-auto">
            Try a company name (e.g. <em>Tesla</em>, <em>Nvidia</em>) or the exact ticker symbol
            (e.g. <em>TSLA</em>, <em>NVDA</em>).
          </p>
          <Link to="/explore" className="inline-block mt-5 text-sm text-blue-400 hover:underline">
            Or browse stocks by sector →
          </Link>
        </div>
      )}
    </div>
  );
}
