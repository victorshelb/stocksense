import { createContext, useContext, useState, useEffect } from 'react';

const WatchlistContext = createContext();

export function WatchlistProvider({ children }) {
  const [watchlist, setWatchlist] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('stocksense_watchlist')) || [];
    } catch {
      return [];
    }
  });

  const [profile, setProfile] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('stocksense_profile')) || { name: '' };
    } catch {
      return { name: '' };
    }
  });

  useEffect(() => {
    localStorage.setItem('stocksense_watchlist', JSON.stringify(watchlist));
  }, [watchlist]);

  useEffect(() => {
    localStorage.setItem('stocksense_profile', JSON.stringify(profile));
  }, [profile]);

  const addToWatchlist = (stock) => {
    if (watchlist.length >= 30) return { ok: false, reason: 'Watchlist is full (30 max).' };
    if (watchlist.find(s => s.symbol === stock.symbol)) return { ok: false, reason: 'Already in watchlist.' };
    setWatchlist(prev => [...prev, { symbol: stock.symbol, name: stock.name || stock.symbol, addedAt: Date.now() }]);
    return { ok: true };
  };

  const removeFromWatchlist = (symbol) =>
    setWatchlist(prev => prev.filter(s => s.symbol !== symbol));

  const isWatched = (symbol) => watchlist.some(s => s.symbol === symbol);

  const updateProfile = (updates) => setProfile(prev => ({ ...prev, ...updates }));

  return (
    <WatchlistContext.Provider
      value={{ watchlist, addToWatchlist, removeFromWatchlist, isWatched, profile, updateProfile }}
    >
      {children}
    </WatchlistContext.Provider>
  );
}

export const useWatchlist = () => useContext(WatchlistContext);
