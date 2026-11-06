import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext.jsx';

export default function AdminPage() {
  const { user } = useAuth();
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');
  const [busyId, setBusyId] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const res = await axios.get('/api/admin/users');
      setData(res.data);
      setError('');
    } catch (e) {
      setError(e.response?.data?.error || 'Could not load users.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function act(id, action) {
    setBusyId(id);
    try {
      if (action === 'delete') {
        if (!window.confirm('Permanently delete this user?')) { setBusyId(null); return; }
        await axios.delete(`/api/admin/users/${id}`);
      } else {
        await axios.post(`/api/admin/users/${id}/${action}`);
      }
      await load();
    } catch (e) {
      alert(e.response?.data?.error || 'Action failed.');
    } finally {
      setBusyId(null);
    }
  }

  // Not signed in, or signed in but not admin
  if (!user) {
    return (
      <div className="text-center py-20">
        <p className="text-4xl mb-3">🔒</p>
        <p className="text-white font-semibold">Admin access only</p>
        <Link to="/auth" className="inline-block mt-4 text-blue-400 hover:underline text-sm">Sign in →</Link>
      </div>
    );
  }
  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-4xl mb-3">🚫</p>
        <p className="text-red-400 font-semibold">{error}</p>
        <Link to="/" className="inline-block mt-4 text-blue-400 hover:underline text-sm">← Back to Market</Link>
      </div>
    );
  }

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">👤 User Admin</h1>
          {data && (
            <p className="text-slate-400 text-sm mt-1">
              {data.count} total · {data.verified} verified · {data.count - data.verified} pending
            </p>
          )}
        </div>
        <button onClick={load} className="text-sm border border-slate-700 hover:border-slate-500 text-slate-300 px-4 py-2 rounded-lg transition">
          ↻ Refresh
        </button>
      </div>

      {loading && <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>}

      {!loading && data && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Name</th>
                  <th className="text-left px-4 py-3">Email</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Joined</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map(u => (
                  <tr key={u.id} className="border-b border-slate-900 hover:bg-slate-800/40 transition">
                    <td className="px-4 py-3">
                      <span className="text-white font-medium">{u.firstName} {u.lastName}</span>
                      {u.isAdmin && <span className="ml-2 text-xs bg-blue-900/50 text-blue-300 px-1.5 py-0.5 rounded">admin</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{u.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className={u.verified ? 'text-emerald-400 text-xs' : 'text-amber-400 text-xs'}>
                          {u.verified ? '✓ verified' : '⏳ unverified'}
                        </span>
                        {u.disabled && <span className="text-red-400 text-xs">⛔ disabled</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{fmtDate(u.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {!u.verified && (
                          <button disabled={busyId === u.id} onClick={() => act(u.id, 'verify')}
                            className="text-xs bg-emerald-900/50 hover:bg-emerald-800 text-emerald-300 px-2.5 py-1.5 rounded-lg transition disabled:opacity-50">
                            Verify
                          </button>
                        )}
                        {!u.isAdmin && (
                          <button disabled={busyId === u.id} onClick={() => act(u.id, 'toggle')}
                            className={`text-xs px-2.5 py-1.5 rounded-lg transition disabled:opacity-50 ${u.disabled ? 'bg-blue-900/50 hover:bg-blue-800 text-blue-300' : 'bg-amber-900/40 hover:bg-amber-800 text-amber-300'}`}>
                            {u.disabled ? 'Enable' : 'Disable'}
                          </button>
                        )}
                        {!u.isAdmin && (
                          <button disabled={busyId === u.id} onClick={() => act(u.id, 'delete')}
                            className="text-xs bg-red-900/40 hover:bg-red-800 text-red-300 px-2.5 py-1.5 rounded-lg transition disabled:opacity-50">
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
