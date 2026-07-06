'use client';

import { useState } from 'react';
import { Lock } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const inputCls = 'w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20';

/** Blocking screen shown when a freshly-invited user (mustResetPassword) signs in.
 *  They must set their own password before reaching the app. */
export function ForcePasswordReset() {
  const { user, logout, login } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 8) { setErr('New password must be at least 8 characters.'); return; }
    if (next !== confirm) { setErr('Passwords do not match.'); return; }
    setBusy(true); setErr('');
    try {
      await api.auth.changePassword(current, next);
      // Changing the password revokes the current session (securityVersion bump), so
      // re-establish it with the new password. login() refetches the user, and
      // mustResetPassword is now false — the app unblocks automatically.
      const res = await login(user?.email ?? '', next);
      if (!res.ok) { setErr('Password updated. Please sign in with your new password.'); setBusy(false); }
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not update password'); setBusy(false); }
  }

  return (
    <div className="flex-1 flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center"><Lock size={18} className="text-brand-600" /></div>
          <h1 className="text-lg font-semibold text-gray-900">Set a new password</h1>
        </div>
        <p className="text-sm text-gray-500 mb-4">Welcome{user?.firstName ? `, ${user.firstName}` : ''}. For security, please replace your temporary password before continuing.</p>
        <form onSubmit={submit} className="space-y-3">
          <input type="password" placeholder="Current (temporary) password" value={current} onChange={e => setCurrent(e.target.value)} className={inputCls} autoFocus />
          <input type="password" placeholder="New password" value={next} onChange={e => setNext(e.target.value)} className={inputCls} />
          <input type="password" placeholder="Confirm new password" value={confirm} onChange={e => setConfirm(e.target.value)} className={inputCls} />
          {err && <p className="text-xs text-red-600">{err}</p>}
          <button type="submit" disabled={busy || !current || !next} className="w-full py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
            {busy ? 'Updating…' : 'Set password & continue'}
          </button>
        </form>
        <button onClick={logout} className="w-full mt-3 text-xs text-gray-400 hover:text-gray-600">Sign out</button>
      </div>
    </div>
  );
}
