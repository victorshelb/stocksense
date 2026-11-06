import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import SearchDropdown from './SearchDropdown.jsx';
import Logo from './Logo.jsx';
import { useWatchlist } from '../context/WatchlistContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function Header() {
  const { watchlist }  = useWatchlist();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const linkClass = ({ isActive }) =>
    `text-sm font-medium transition ${isActive ? 'text-white' : 'text-slate-400 hover:text-white'}`;

  const initials = user
    ? `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase()
    : '';

  return (
    <header className="border-b border-slate-800 bg-slate-950/85 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">

        {/* Logo */}
        <NavLink to="/" className="shrink-0 hover:opacity-90 transition-opacity">
          <Logo size={30} />
        </NavLink>

        {/* Search */}
        <SearchDropdown />

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-5 shrink-0">
          <NavLink to="/" end className={linkClass}>Home</NavLink>
          <NavLink to="/explore" className={linkClass}>Explore</NavLink>
          <NavLink to="/watchlist" className={({ isActive }) =>
            `text-sm font-medium transition flex items-center gap-1.5 ${isActive ? 'text-white' : 'text-slate-400 hover:text-white'}`
          }>
            ⭐ Watchlist
            {watchlist.length > 0 && (
              <span className="bg-blue-600 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {watchlist.length}
              </span>
            )}
          </NavLink>

          {/* User menu */}
          {user ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(v => !v)}
                className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-full flex items-center justify-center text-xs font-bold text-white hover:ring-2 hover:ring-blue-500 transition"
              >
                {initials || '👤'}
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-slate-800">
                    <p className="text-sm font-semibold text-white">{user.firstName} {user.lastName}</p>
                    <p className="text-xs text-slate-500 truncate">{user.email}</p>
                  </div>
                  <button
                    onClick={() => { navigate('/account'); setMenuOpen(false); }}
                    className="w-full text-left px-4 py-3 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition"
                  >
                    ⚙️ Account settings
                  </button>
                  <button
                    onClick={() => { navigate('/watchlist'); setMenuOpen(false); }}
                    className="w-full text-left px-4 py-3 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition border-t border-slate-800"
                  >
                    ⭐ My Watchlist
                  </button>
                  {user.isAdmin && (
                    <button
                      onClick={() => { navigate('/admin'); setMenuOpen(false); }}
                      className="w-full text-left px-4 py-3 text-sm text-blue-300 hover:bg-slate-800 hover:text-white transition border-t border-slate-800"
                    >
                      🛡️ Admin Panel
                    </button>
                  )}
                  <button
                    onClick={() => { logout(); setMenuOpen(false); }}
                    className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-slate-800 transition border-t border-slate-800"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <NavLink to="/auth"
              className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition">
              Sign In
            </NavLink>
          )}
        </nav>
      </div>
    </header>
  );
}
