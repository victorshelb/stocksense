import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { WatchlistProvider } from './context/WatchlistContext.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import Header from './components/Header.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import Dashboard from './pages/Dashboard.jsx';
import StockDetail from './pages/StockDetail.jsx';
import ExplorePage from './pages/ExplorePage.jsx';
import WatchlistPage from './pages/WatchlistPage.jsx';
import FilingPage from './pages/FilingPage.jsx';
import SearchPage from './pages/SearchPage.jsx';
import AuthPage from './pages/AuthPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import AccountPage from './pages/AccountPage.jsx';
import Disclaimer from './components/Disclaimer.jsx';

function BottomNav() {
  const cls = ({ isActive }) =>
    `flex flex-col items-center gap-0.5 px-4 py-2 text-xs font-medium transition ${
      isActive ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'
    }`;
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/90 backdrop-blur border-t border-slate-800 flex sm:hidden justify-around">
      <NavLink to="/"          end className={cls}><span className="text-lg">📊</span> Home</NavLink>
      <NavLink to="/explore"       className={cls}><span className="text-lg">🔭</span> Explore</NavLink>
      <NavLink to="/watchlist"     className={cls}><span className="text-lg">⭐</span> Watchlist</NavLink>
      <NavLink to="/account"       className={cls}><span className="text-lg">👤</span> Account</NavLink>
    </nav>
  );
}

function AppShell() {
  const location = useLocation();
  return (
    <div className="min-h-screen flex flex-col pb-16 sm:pb-0">
      <Header />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8">
        {/* keyed by path → the boundary resets when you navigate to a new page */}
        <ErrorBoundary key={location.pathname}>
          <Routes>
            <Route path="/"          element={<Dashboard />} />
            <Route path="/explore"   element={<ExplorePage />} />
            <Route path="/watchlist" element={<WatchlistPage />} />
            <Route path="/stock/:symbol" element={<StockDetail />} />
            <Route path="/search"    element={<SearchPage />} />
            <Route path="/filing"    element={<FilingPage />} />
            <Route path="/auth"      element={<AuthPage />} />
            <Route path="/login"     element={<AuthPage />} />
            <Route path="/register"  element={<AuthPage />} />
            <Route path="/admin"     element={<AdminPage />} />
            <Route path="/account"   element={<AccountPage />} />
          </Routes>
        </ErrorBoundary>
      </main>
      <Disclaimer />
      <BottomNav />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <WatchlistProvider>
        <AppShell />
      </WatchlistProvider>
    </AuthProvider>
  );
}
