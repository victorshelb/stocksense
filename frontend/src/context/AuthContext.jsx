import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session from localStorage token on page load
  useEffect(() => {
    const token = localStorage.getItem('stocksense_token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      axios.get('/api/auth/me')
        .then(r => setUser(r.data))
        .catch(() => {
          localStorage.removeItem('stocksense_token');
          delete axios.defaults.headers.common['Authorization'];
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  function applyToken(token) {
    localStorage.setItem('stocksense_token', token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  async function login(email, password) {
    const res = await axios.post('/api/auth/login', { email, password });
    if (res.data.twoFactorRequired) return res.data; // caller shows the code step
    applyToken(res.data.token);
    setUser(res.data.user);
    return res.data.user;
  }

  async function verifyTwoFactor(userId, code) {
    const res = await axios.post('/api/auth/2fa/verify', { userId, code });
    applyToken(res.data.token);
    setUser(res.data.user);
    return res.data.user;
  }

  // Register no longer logs the user in — they must verify their email first.
  // Returns { message, emailed, verifyLink? } for the UI to display.
  async function register(data) {
    const res = await axios.post('/api/auth/register', data);
    return res.data;
  }

  function logout() {
    localStorage.removeItem('stocksense_token');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
  }

  async function refreshUser() {
    try {
      const res = await axios.get('/api/auth/me');
      setUser(res.data);
      return res.data;
    } catch { return null; }
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser, verifyTwoFactor }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
