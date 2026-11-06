import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext.jsx';
import { useWatchlist } from '../context/WatchlistContext.jsx';

function pwChecks(pw) {
  return {
    'At least 8 characters': pw.length >= 8,
    'One uppercase letter':  /[A-Z]/.test(pw),
    'One number':            /[0-9]/.test(pw),
    'One special character': /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(pw),
  };
}

function Field({ label, type = 'text', value, onChange, placeholder, reveal, onReveal }) {
  return (
    <div>
      <label className="text-xs text-slate-400 block mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={type} value={value} onChange={onChange} placeholder={placeholder}
          className="w-full bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition pr-11"
        />
        {onReveal && (
          <button type="button" onClick={onReveal} tabIndex={-1}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200 text-xs">
            {reveal ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function AccountPage() {
  const { user, logout, refreshUser } = useAuth();
  const { watchlist } = useWatchlist();
  const navigate = useNavigate();

  // change password
  const [pw, setPw]       = useState({ current: '', next: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);
  const [pwBusy, setPwBusy] = useState(false);

  // 2FA
  const [twoFA, setTwoFA] = useState(user?.twoFactorEnabled || false);
  const [twoFAMsg, setTwoFAMsg] = useState('');

  if (!user) {
    return (
      <div className="text-center py-20">
        <p className="text-4xl mb-3">🔒</p>
        <p className="text-white font-semibold mb-1">You're not signed in</p>
        <p className="text-slate-400 text-sm mb-4">Sign in to manage your account.</p>
        <Link to="/auth" className="inline-block bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition">Sign in →</Link>
      </div>
    );
  }

  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();
  const checks = pwChecks(pw.next);
  const allMet = Object.values(checks).every(Boolean);

  async function changePassword(e) {
    e.preventDefault();
    setPwMsg(null);
    if (!allMet) return setPwMsg({ ok: false, text: 'New password does not meet the requirements.' });
    if (pw.next !== pw.confirm) return setPwMsg({ ok: false, text: "New passwords don't match." });
    setPwBusy(true);
    try {
      const res = await axios.put('/api/user/password', { currentPassword: pw.current, newPassword: pw.next });
      setPwMsg({ ok: true, text: res.data.message || 'Password updated.' });
      setPw({ current: '', next: '', confirm: '' });
    } catch (err) {
      setPwMsg({ ok: false, text: err.response?.data?.error || 'Could not update password.' });
    } finally {
      setPwBusy(false);
    }
  }

  async function toggle2FA() {
    const next = !twoFA;
    setTwoFA(next);
    setTwoFAMsg('');
    try {
      await axios.post('/api/user/2fa', { enabled: next });
      await refreshUser();
      setTwoFAMsg(next
        ? 'Two-step verification is ON. Next time you sign in, we\'ll email you a 6-digit code.'
        : 'Two-step verification turned off.');
    } catch {
      setTwoFA(!next); // revert
      setTwoFAMsg('Could not update. Try again.');
    }
  }

  const card = 'bg-slate-900 border border-slate-800 rounded-2xl';

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-extrabold text-white mb-6">Account</h1>

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
        {/* Profile */}
        <div className={`${card} p-6 text-center h-fit`}>
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-white text-2xl font-black flex items-center justify-center mx-auto mb-3">
            {initials || '👤'}
          </div>
          <h2 className="text-lg font-bold text-white">{user.firstName} {user.lastName}</h2>
          <p className="text-slate-500 text-sm">{user.email}</p>
          <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
            <span className="text-xs bg-amber-900/40 text-amber-300 px-2.5 py-1 rounded-full">★ Free plan</span>
            {user.isAdmin && <span className="text-xs bg-blue-900/50 text-blue-300 px-2.5 py-1 rounded-full">🛡️ Admin</span>}
          </div>
          {user.isAdmin && (
            <button onClick={() => navigate('/admin')}
              className="w-full mt-4 text-sm bg-slate-800 hover:bg-slate-700 text-blue-300 border border-slate-700 py-2 rounded-lg transition">
              🛡️ Open Admin Panel
            </button>
          )}
          <button onClick={() => { logout(); navigate('/'); }}
            className="w-full mt-2 text-sm text-red-400 hover:bg-slate-800 py-2 rounded-lg transition">
            Sign out
          </button>
        </div>

        {/* Settings */}
        <div className="space-y-5">

          {/* Preferences */}
          <div className={card}>
            <div className="px-5 py-3 border-b border-slate-800"><h3 className="font-bold text-white text-sm uppercase tracking-wider">Preferences</h3></div>
            <div className="px-5 py-4 flex items-center justify-between gap-4 border-b border-slate-800">
              <div>
                <p className="text-sm text-slate-200 font-medium">Appearance</p>
                <p className="text-xs text-slate-500">Light & dark follow your device automatically — no setting needed.</p>
              </div>
              <span className="text-xs text-slate-400 bg-slate-800 border border-slate-700 px-2.5 py-1 rounded-full shrink-0">Auto · device</span>
            </div>
            <div className="px-5 py-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-slate-200 font-medium">Daily email alerts</p>
                <p className="text-xs text-slate-500">Manage your watchlist digest on the Watchlist page.</p>
              </div>
              <Link to="/watchlist" className="text-xs text-blue-400 hover:underline shrink-0">Manage →</Link>
            </div>
          </div>

          {/* Change password */}
          <div className={card}>
            <div className="px-5 py-3 border-b border-slate-800"><h3 className="font-bold text-white text-sm uppercase tracking-wider">Change password</h3></div>
            <form onSubmit={changePassword} className="px-5 py-4 space-y-3">
              <Field label="Current password" type={showPw ? 'text' : 'password'} value={pw.current}
                onChange={e => setPw(p => ({ ...p, current: e.target.value }))} placeholder="Your current password"
                reveal={showPw} onReveal={() => setShowPw(v => !v)} />
              <Field label="New password" type={showPw ? 'text' : 'password'} value={pw.next}
                onChange={e => setPw(p => ({ ...p, next: e.target.value }))} placeholder="Create a new password" />
              {pw.next && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {Object.entries(checks).map(([label, met]) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <span className={`text-xs font-bold ${met ? 'text-emerald-400' : 'text-slate-600'}`}>{met ? '✓' : '○'}</span>
                      <span className={`text-xs ${met ? 'text-slate-400' : 'text-slate-600'}`}>{label}</span>
                    </div>
                  ))}
                </div>
              )}
              <Field label="Confirm new password" type={showPw ? 'text' : 'password'} value={pw.confirm}
                onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))} placeholder="Repeat the new password" />
              {pwMsg && (
                <p className={`text-sm ${pwMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{pwMsg.text}</p>
              )}
              <button type="submit" disabled={pwBusy}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
                {pwBusy ? 'Updating…' : 'Update password'}
              </button>
            </form>
          </div>

          {/* Two-step verification */}
          <div className={card}>
            <div className="px-5 py-3 border-b border-slate-800"><h3 className="font-bold text-white text-sm uppercase tracking-wider">Two-step verification</h3></div>
            <div className="px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-200 font-medium">Email sign-in code</p>
                  <p className="text-xs text-slate-500">Require a 6-digit code (sent to your email) every time you sign in. Adds a second layer of security.</p>
                </div>
                <button onClick={toggle2FA}
                  className={`w-12 h-7 rounded-full transition-colors shrink-0 relative ${twoFA ? 'bg-emerald-600' : 'bg-slate-700'}`}>
                  <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${twoFA ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
              {twoFAMsg && <p className="text-xs text-slate-400 mt-3">{twoFAMsg}</p>}
            </div>
          </div>

          {/* Activity */}
          <div className={card}>
            <div className="px-5 py-3 border-b border-slate-800"><h3 className="font-bold text-white text-sm uppercase tracking-wider">Your activity</h3></div>
            <div className="px-5 py-2">
              <div className="flex items-center justify-between py-2.5 border-b border-slate-800/60">
                <span className="text-sm text-slate-300">Stocks watched</span>
                <span className="text-sm font-bold text-white">{watchlist.length}</span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-sm text-slate-300">Member since</span>
                <span className="text-sm font-bold text-white">
                  {user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—'}
                </span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
