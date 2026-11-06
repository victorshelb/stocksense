import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

/* ── Password strength checker ─────────────────────────────────────────── */
function passwordChecks(pw) {
  return {
    length:    { label: 'At least 8 characters',            met: pw.length >= 8 },
    uppercase: { label: 'One uppercase letter (A–Z)',        met: /[A-Z]/.test(pw) },
    number:    { label: 'One number (0–9)',                  met: /[0-9]/.test(pw) },
    special:   { label: 'One special character (!@#$…)',     met: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(pw) },
  };
}

function StrengthBar({ password }) {
  const checks = Object.values(passwordChecks(password));
  const met    = checks.filter(c => c.met).length;
  const colors = ['bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-emerald-500'];

  return (
    <div className="mt-3">
      {/* Bar */}
      <div className="flex gap-1 mb-2">
        {[0,1,2,3].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i < met ? colors[met - 1] : 'bg-slate-700'}`} />
        ))}
      </div>
      {/* Checklist */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {Object.values(passwordChecks(password)).map(({ label, met }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`text-xs font-bold ${met ? 'text-emerald-400' : 'text-slate-600'}`}>
              {met ? '✓' : '○'}
            </span>
            <span className={`text-xs ${met ? 'text-slate-400' : 'text-slate-600'}`}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Password input with show/hide toggle ──────────────────────────────── */
function PasswordInput({ id, value, onChange, placeholder, autoComplete }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="w-full bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition pr-12"
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200 transition select-none"
        tabIndex={-1}
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? (
          /* Eye-off */
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
          </svg>
        ) : (
          /* Eye */
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        )}
      </button>
    </div>
  );
}

/* ── Main Auth Page ────────────────────────────────────────────────────── */
export default function AuthPage() {
  const [mode, setMode]   = useState('login');
  const [form, setForm]   = useState({ firstName: '', lastName: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy]   = useState(false);
  const [verifyScreen, setVerifyScreen] = useState(null); // { message, verifyLink, email }
  const [twoFA, setTwoFA] = useState(null); // { userId, devCode }
  const [code, setCode]   = useState('');
  const { login, register, verifyTwoFactor } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const verifyStatus = params.get('verify'); // 'success' | 'invalid' after clicking the email link

  const set = (field) => (e) => {
    setError('');
    setForm(f => ({ ...f, [field]: e.target.value }));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (mode === 'register') {
      const checks = passwordChecks(form.password);
      if (!Object.values(checks).every(c => c.met)) {
        setError('Please make sure your password meets all requirements below.');
        return;
      }
      if (form.password !== form.confirm) {
        setError("Passwords don't match.");
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === 'login') {
        const result = await login(form.email, form.password);
        if (result?.twoFactorRequired) {
          setTwoFA({ userId: result.userId, devCode: result.devCode });
        } else {
          navigate('/watchlist');
        }
      } else {
        const result = await register({ firstName: form.firstName, lastName: form.lastName, email: form.email, password: form.password });
        // Account created but NOT logged in — show the "verify your email" screen
        setVerifyScreen({ message: result.message, verifyLink: result.verifyLink, email: form.email });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function submit2FA(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await verifyTwoFactor(twoFA.userId, code.trim());
      navigate('/watchlist');
    } catch (err) {
      setError(err.response?.data?.error || 'Incorrect code. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next) {
    setMode(next);
    setError('');
    setForm(f => ({ ...f, password: '', confirm: '' }));
  }

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">

        {/* Branding */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-3">
            <span className="text-3xl">📈</span>
            <span className="text-2xl font-bold text-white">Stock<span className="text-blue-400">Sense</span></span>
          </Link>
          <p className="text-slate-400 text-sm">
            {mode === 'login' ? 'Sign in to access your watchlist & alerts' : 'Create a free account to save stocks & get email alerts'}
          </p>
        </div>

        {/* After clicking the email verification link */}
        {!verifyScreen && verifyStatus === 'success' && (
          <div className="bg-emerald-950/50 border border-emerald-800 rounded-xl px-4 py-3 mb-6 text-center">
            <p className="text-emerald-300 text-sm font-semibold">✓ Email verified — you can sign in now.</p>
          </div>
        )}
        {!verifyScreen && verifyStatus === 'invalid' && (
          <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 mb-6 text-center">
            <p className="text-red-300 text-sm">That verification link is invalid or already used.</p>
          </div>
        )}

        {twoFA ? (
          <form onSubmit={submit2FA} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center">
            <p className="text-4xl mb-3">🔐</p>
            <h2 className="text-lg font-bold text-white mb-2">Enter your code</h2>
            <p className="text-slate-400 text-sm mb-4">
              We sent a 6-digit code to your email — enter it to finish signing in.
              {twoFA.devCode && <span className="block mt-1 text-amber-400">Testing-mode code: <b>{twoFA.devCode}</b></span>}
            </p>
            <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric" placeholder="000000" autoFocus
              className="w-full bg-slate-800 border border-slate-700 text-white text-center text-2xl tracking-[0.4em] font-mono rounded-lg px-4 py-3 mb-3 focus:outline-none focus:border-blue-500" />
            {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
            <button type="submit" disabled={busy || code.length < 6}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white font-semibold py-3 rounded-xl transition text-sm">
              {busy ? 'Verifying…' : 'Verify & sign in'}
            </button>
            <button type="button" onClick={() => { setTwoFA(null); setCode(''); setError(''); }}
              className="text-xs text-slate-500 hover:text-slate-300 mt-3">← Back to sign in</button>
          </form>
        ) : verifyScreen ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center">
            <p className="text-4xl mb-3">📬</p>
            <h2 className="text-lg font-bold text-white mb-2">Check your email</h2>
            <p className="text-slate-400 text-sm mb-4">{verifyScreen.message}</p>
            {verifyScreen.verifyLink && (
              <a href={verifyScreen.verifyLink}
                className="inline-block bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition mb-2">
                Verify now (testing link) →
              </a>
            )}
            <p className="text-xs text-slate-500 mt-3">
              After verifying,{' '}
              <button onClick={() => { setVerifyScreen(null); setMode('login'); }} className="text-blue-400 hover:underline">sign in here</button>.
            </p>
          </div>
        ) : (
        <>

        {/* Tab switch */}
        <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-1 mb-6">
          {['login', 'register'].map(m => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition ${mode === m ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              {m === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          ))}
        </div>

        {/* Form card */}
        <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">

          {mode === 'register' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">First Name</label>
                <input
                  value={form.firstName} onChange={set('firstName')}
                  placeholder="John" required autoComplete="given-name"
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500 transition"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Last Name</label>
                <input
                  value={form.lastName} onChange={set('lastName')}
                  placeholder="Doe" required autoComplete="family-name"
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500 transition"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Email Address</label>
            <input
              type="email" value={form.email} onChange={set('email')}
              placeholder="you@example.com" required autoComplete="email"
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500 transition"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Password</label>
            <PasswordInput
              id="password" value={form.password} onChange={set('password')}
              placeholder={mode === 'register' ? 'Create a strong password' : 'Enter your password'}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            />
            {mode === 'register' && form.password && (
              <StrengthBar password={form.password} />
            )}
          </div>

          {mode === 'register' && (
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Confirm Password</label>
              <PasswordInput
                id="confirm-password" value={form.confirm} onChange={set('confirm')}
                placeholder="Repeat your password" autoComplete="new-password"
              />
              {form.confirm && form.password !== form.confirm && (
                <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1">
                  <span>✕</span> Passwords don't match
                </p>
              )}
              {form.confirm && form.password === form.confirm && form.confirm.length > 0 && (
                <p className="text-xs text-emerald-400 mt-1.5 flex items-center gap-1">
                  <span>✓</span> Passwords match
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-950/40 border border-red-800/60 rounded-lg px-4 py-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition text-sm mt-2"
          >
            {busy
              ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Please wait…</span>
              : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-500 mt-4">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
            className="text-blue-400 hover:underline font-medium"
          >
            {mode === 'login' ? 'Create one free' : 'Sign in'}
          </button>
        </p>

        <p className="text-center text-xs text-slate-600 mt-2">
          <Link to="/" className="hover:text-slate-400 transition">← Back to Market Overview</Link>
        </p>
        </>
        )}
      </div>
    </div>
  );
}
