import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useWatchlist } from '../context/WatchlistContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import MiniChart from '../components/MiniChart.jsx';
import StockLogo from '../components/StockLogo.jsx';

function WatchlistCard({ stock, onRemove }) {
  const navigate = useNavigate();

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden hover:border-slate-700 transition group">
      {/* Mini chart */}
      <div className="px-1 pt-1">
        <MiniChart symbol={stock.symbol} height={150} range="3M" />
      </div>

      <div className="px-4 pb-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <StockLogo symbol={stock.symbol} name={stock.name} size={34} />
            <div className="min-w-0">
              <p className="text-base font-bold text-white group-hover:text-blue-300 transition">
                {stock.symbol}
              </p>
              <p className="text-xs text-slate-500 line-clamp-1">{stock.name}</p>
            </div>
          </div>
          <button
            onClick={() => onRemove(stock.symbol)}
            className="text-slate-600 hover:text-red-400 transition text-sm shrink-0"
            title="Remove from watchlist"
          >
            ✕
          </button>
        </div>
        <button
          onClick={() => navigate(`/stock/${stock.symbol}`)}
          className="w-full text-xs bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 rounded-lg transition"
        >
          View AI Analysis →
        </button>
      </div>
    </div>
  );
}

export default function WatchlistPage() {
  const { watchlist, addToWatchlist, removeFromWatchlist, profile, updateProfile } = useWatchlist();
  const { user, refreshUser } = useAuth();
  const [search, setSearch]         = useState('');
  const [searchResults, setResults] = useState([]);
  const [searching, setSearching]   = useState(false);
  const [toast, setToast]           = useState('');
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName]   = useState(profile.name);
  const debounceRef = useRef(null);

  // Email alert state
  const [alertEmail, setAlertEmail]   = useState(user?.notificationEmail || user?.email || '');
  const [alertEnabled, setAlertEnabled] = useState(user?.emailNotifications || false);
  const [alertSaving, setAlertSaving] = useState(false);
  const [alertSending, setAlertSending] = useState(false);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  async function handleSearchChange(e) {
    const val = e.target.value;
    setSearch(val);
    if (!val.trim()) { setResults([]); return; }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await axios.get(`/api/search?q=${encodeURIComponent(val)}`);
        setResults(res.data || []);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 300);
  }

  function handleAdd(stock) {
    const result = addToWatchlist({ symbol: stock.symbol, name: stock.name });
    showToast(result.ok ? `✓ ${stock.symbol} added to watchlist` : result.reason);
    setSearch('');
    setResults([]);
  }

  function handleRemove(symbol) {
    removeFromWatchlist(symbol);
    showToast(`Removed ${symbol}`);
  }

  function saveName() {
    updateProfile({ name: draftName.trim() });
    setEditingName(false);
  }

  const displayName = profile.name || 'Investor';
  const slots = 30 - watchlist.length;

  return (
    <div>
      {/* Toast notification */}
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-slate-800 border border-slate-700 text-white text-sm px-4 py-2 rounded-full shadow-xl">
          {toast}
        </div>
      )}

      {/* Profile header card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 mb-10 flex items-center gap-4">
        <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl flex items-center justify-center text-2xl font-black text-white shrink-0">
          {displayName[0]?.toUpperCase() || '?'}
        </div>

        {editingName ? (
          <div className="flex-1 flex items-center gap-2 flex-wrap">
            <input
              value={draftName}
              onChange={e => setDraftName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveName()}
              className="flex-1 min-w-[140px] bg-slate-800 border border-slate-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              placeholder="Your name"
              autoFocus
            />
            <button onClick={saveName} className="text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition">Save</button>
            <button onClick={() => setEditingName(false)} className="text-xs text-slate-400 hover:text-white px-2 py-2 transition">Cancel</button>
          </div>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold text-white truncate">Hi, {displayName} 👋</h1>
              <p className="text-slate-400 text-sm mt-1">
                {watchlist.length} of 30 watched · <span className="text-slate-500">{slots} slot{slots !== 1 ? 's' : ''} left</span>
              </p>
            </div>
            <button
              onClick={() => setEditingName(true)}
              className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg px-3 py-2 transition"
            >
              ✏️ <span className="hidden sm:inline">Edit name</span>
            </button>
          </>
        )}
      </div>

      {/* Add stock search */}
      <div className="mb-8">
        <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
          <span>⭐</span> Your Watchlist
        </h2>

        <div className="relative max-w-md mb-6">
          <input
            value={search}
            onChange={handleSearchChange}
            placeholder="Search to add a stock — e.g. Apple, TSLA"
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
          />
          {searching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {search && searchResults.length > 0 && (
            <div className="absolute top-full mt-1 left-0 right-0 bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-2xl z-30">
              {searchResults.map(r => (
                <button
                  key={r.symbol}
                  onMouseDown={() => handleAdd(r)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800 transition text-left border-b border-slate-800 last:border-0"
                >
                  <span className="text-sm font-bold text-white">{r.symbol}</span>
                  <span className="text-sm text-slate-400 truncate">{r.name}</span>
                  <span className="ml-auto text-xs text-emerald-400 shrink-0">+ Add</span>
                </button>
              ))}
            </div>
          )}

          {search && !searching && searchResults.length === 0 && (
            <div className="absolute top-full mt-1 left-0 right-0 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 z-30">
              <p className="text-sm text-slate-500">No results. Try the exact ticker (e.g. AAPL).</p>
            </div>
          )}
        </div>

        {/* Watchlist grid */}
        {watchlist.length === 0 ? (
          <div className="text-center py-16 bg-slate-900/50 border border-slate-800 rounded-2xl">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-white font-semibold text-lg">Your watchlist is empty</p>
            <p className="text-slate-400 text-sm mt-2">
              Search above to add up to 30 stocks. You can also add stocks from any stock's detail page.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {watchlist.map(stock => (
              <WatchlistCard key={stock.symbol} stock={stock} onRemove={handleRemove} />
            ))}
          </div>
        )}
      </div>

      {/* ── Email Alerts ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mt-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xl">📧</span>
          <div>
            <h3 className="text-base font-bold text-white">Daily Email Alerts</h3>
            <p className="text-xs text-slate-500">Get your watchlist prices delivered to your inbox every day</p>
          </div>
        </div>

        {!user ? (
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 text-center">
            <p className="text-slate-400 text-sm mb-3">
              Create a free account to receive daily email updates on your watchlist stocks.
            </p>
            <Link to="/auth"
              className="inline-block bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-5 py-2 rounded-lg transition">
              Sign In / Create Account
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Toggle */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-300">Send me daily updates</p>
                <p className="text-xs text-slate-500 mt-0.5">Prices + links for all your watchlist stocks</p>
              </div>
              <button
                onClick={() => setAlertEnabled(v => !v)}
                className={`w-11 h-6 rounded-full transition-colors shrink-0 relative ${alertEnabled ? 'bg-blue-600' : 'bg-slate-700'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${alertEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>

            {/* Email input */}
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Send to email</label>
              <input
                type="email"
                value={alertEmail}
                onChange={e => setAlertEmail(e.target.value)}
                placeholder={user.email}
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition"
              />
            </div>

            {/* Save + Test buttons */}
            <div className="flex gap-2 flex-wrap">
              <button
                disabled={alertSaving}
                onClick={async () => {
                  setAlertSaving(true);
                  try {
                    const res = await axios.post('/api/email/subscribe', { enabled: alertEnabled, notificationEmail: alertEmail });
                    await refreshUser();
                    if (alertEnabled && res.data.welcomeSent) showToast('✓ Saved — check your inbox for your first digest!');
                    else if (alertEnabled && res.data.emailError) showToast('Saved — but email isn’t set up yet (see note below)');
                    else showToast('✓ Email preferences saved');
                  } catch (err) {
                    showToast(err.response?.data?.error || 'Failed to save preferences');
                  } finally { setAlertSaving(false); }
                }}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
              >
                {alertSaving ? 'Saving…' : 'Save Preferences'}
              </button>

              <button
                disabled={alertSending || !watchlist.length}
                onClick={async () => {
                  setAlertSending(true);
                  try {
                    const res = await axios.post('/api/email/test', { notificationEmail: alertEmail || user.email });
                    showToast(`✓ ${res.data.message}`);
                  } catch (err) {
                    showToast(err.response?.data?.error || 'Email send failed — check your .env email config');
                  } finally { setAlertSending(false); }
                }}
                className="border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50"
              >
                {alertSending ? 'Sending…' : '📨 Send Test Email'}
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Email setup requires GMAIL_USER + GMAIL_APP_PASSWORD in your backend .env file.
              See .env.example for instructions.
            </p>
          </div>
        )}
      </div>

      {/* Tips */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mt-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Tips</p>
        <ul className="space-y-1.5 text-sm text-slate-400">
          <li className="flex gap-2"><span className="text-blue-400">•</span> Click any stock chart to open in TradingView for more detail</li>
          <li className="flex gap-2"><span className="text-blue-400">•</span> Add stocks from any stock's detail page with the <strong className="text-white">☆ Add to Watchlist</strong> button</li>
          <li className="flex gap-2"><span className="text-blue-400">•</span> Charts show the last 3 months — 100% free, no API limits</li>
          <li className="flex gap-2"><span className="text-blue-400">•</span> Sign in to enable daily email alerts and sync your watchlist across devices</li>
        </ul>
      </div>
    </div>
  );
}
