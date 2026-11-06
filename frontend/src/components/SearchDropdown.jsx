import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import StockLogo from './StockLogo.jsx';

export default function SearchDropdown() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const debounceRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleChange(e) {
    const val = e.target.value;
    setQuery(val);

    if (!val.trim()) {
      setResults([]);
      setOpen(false);
      clearTimeout(debounceRef.current);
      return;
    }

    setOpen(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await axios.get(`/api/search?q=${encodeURIComponent(val.trim())}`);
        setResults(res.data || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }

  function handleSelect(symbol) {
    setQuery('');
    setOpen(false);
    setResults([]);
    navigate(`/stock/${symbol.toUpperCase()}`);
  }

  function handleSubmit(e) {
    e.preventDefault();
    const raw = query.trim();
    if (!raw) return;
    // Always show the results list — never guess a ticker (that caused /stock/APPLE blanks)
    setQuery('');
    setResults([]);
    setOpen(false);
    navigate(`/search?q=${encodeURIComponent(raw)}`);
  }

  const showDropdown = open && query.length >= 1;

  return (
    <div ref={containerRef} className="relative flex-1 min-w-0 max-w-md">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => query && setOpen(true)}
          placeholder="Search by name or ticker — e.g. Apple, TSLA, Amazon"
          className="w-full bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
        />
        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition shrink-0"
        >
          Search
        </button>
      </form>

      {showDropdown && (
        <div className="absolute top-full mt-1.5 left-0 right-12 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          {loading && (
            <div className="px-4 py-3 text-sm text-slate-500 animate-pulse flex items-center gap-2">
              <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              Searching...
            </div>
          )}

          {!loading && results.length === 0 && query.length >= 2 && (
            <div className="px-4 py-3">
              <p className="text-sm text-slate-400">No matches found.</p>
              <p className="text-xs text-slate-600 mt-0.5">
                Try the exact ticker (e.g. AMZN for Amazon, GOOGL for Google)
              </p>
            </div>
          )}

          {results.slice(0, 6).map((r) => (
            <button
              key={r.symbol}
              onMouseDown={() => handleSelect(r.symbol)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800 transition text-left border-b border-slate-800/60 last:border-0"
            >
              <StockLogo symbol={r.symbol} name={r.name} size={30} />
              <span className="text-sm font-bold text-white shrink-0 min-w-[48px]">{r.symbol}</span>
              <span className="text-sm text-slate-400 truncate">{r.name}</span>
            </button>
          ))}

          {/* See all results */}
          {!loading && results.length > 0 && (
            <button
              onMouseDown={() => { const q = query.trim(); setQuery(''); setResults([]); setOpen(false); navigate(`/search?q=${encodeURIComponent(q)}`); }}
              className="w-full text-center px-4 py-2.5 text-xs text-blue-400 hover:bg-slate-800 transition font-medium"
            >
              See all results for "{query.trim()}" →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
