'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Loader, Eye, EyeOff, ArrowLeft, MailCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // 'forgot' = asking an admin for a reset; 'requested' = we've told them.
  const [mode, setMode] = useState<'signin' | 'forgot' | 'requested'>('signin');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const res = await login(email, password);
    if (res.ok) {
      router.replace('/home');
    } else {
      setError(res.error ?? 'Sign in failed');
      setLoading(false);
    }
  }

  async function requestReset(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.auth.requestPasswordReset(email);
      setMode('requested'); // deliberately shown even for an unknown address
    } catch {
      setError('Could not send the request. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // Being locked out by failed attempts is the most common reason someone needs help,
  // so make the way out obvious exactly when they hit it.
  const lockedOut = /locked/i.test(error);

  // A single soft wash from the top rather than a three-stop diagonal gradient. A visible
  // gradient behind a form is the oldest "we styled it" tell there is; this one reads as
  // light falling on a surface, which is what a gradient is meant to imitate.
  return (
    <div className="relative min-h-full w-full flex items-center justify-center px-4 py-10 bg-[#F4F6F9]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(61,141,226,0.10),transparent_70%)]"
      />
      <div className="relative w-full max-w-[400px]">
        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <Image src="/fav.png" alt="" width={44} height={44} className="rounded-xl mb-4" />
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-gray-900">Squark Dashboard</h1>
          <p className="text-[13px] text-gray-500 mt-1.5">Sign in to your workspace</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl ring-1 ring-gray-950/[0.06] shadow-[0_4px_6px_-2px_rgb(16_24_40_/_0.05),0_12px_24px_-4px_rgb(16_24_40_/_0.09)] p-7">

        {/* ── The request has been raised; an admin has to act on it. ───────────── */}
        {mode === 'requested' ? (
          <div className="text-center py-2">
            <div className="w-11 h-11 rounded-full bg-emerald-50 text-emerald-600 grid place-items-center mx-auto mb-4">
              <MailCheck size={20} />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Your administrator has been notified</h2>
            <p className="text-xs text-gray-500 mt-2 leading-relaxed">
              If <span className="font-medium text-gray-700">{email}</span> is an account here, an administrator
              can now reset it. They&apos;ll give you a temporary password, and you&apos;ll choose a new one when
              you sign in.
            </p>
            <button
              onClick={() => { setMode('signin'); setError(''); }}
              className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:underline"
            >
              <ArrowLeft size={13} /> Back to sign in
            </button>
          </div>
        ) : mode === 'forgot' ? (
          /* ── Can't get in: raise a hand. There is no reset email — an admin does it. ── */
          <>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-gray-900 mb-1.5">Can&apos;t sign in?</h2>
            <p className="text-xs text-gray-500 mb-5 leading-relaxed">
              Enter your work email and we&apos;ll notify an administrator to reset your password.
            </p>
            <form onSubmit={requestReset} className="space-y-4">
              <div>
                <label className="block text-[12.5px] font-medium text-gray-700 mb-1.5">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@squarkip.com"
                  autoComplete="username"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-white text-[14px] text-gray-900 ring-1 ring-inset ring-gray-950/[0.10] placeholder:text-gray-400 transition-shadow focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500"
                />
              </div>
              {error && (
                <div className="text-[12.5px] leading-relaxed text-red-700 bg-red-50 ring-1 ring-inset ring-red-600/15 rounded-lg px-3 py-2.5">{error}</div>
              )}
              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white text-[13.5px] font-medium py-2.5 rounded-lg transition-colors"
              >
                {loading && <Loader size={15} className="animate-spin" />}
                Notify an administrator
              </button>
            </form>
            <button
              onClick={() => { setMode('signin'); setError(''); }}
              className="mt-5 w-full inline-flex items-center justify-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft size={13} /> Back to sign in
            </button>
          </>
        ) : (
          <>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[12.5px] font-medium text-gray-700 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@squarkip.com"
                autoComplete="username"
                className="w-full px-3.5 py-2.5 rounded-lg bg-white text-[14px] text-gray-900 ring-1 ring-inset ring-gray-950/[0.10] placeholder:text-gray-400 transition-shadow focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-[12.5px] font-medium text-gray-700 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full px-3.5 py-2.5 pr-10 rounded-lg bg-white text-[14px] text-gray-900 ring-1 ring-inset ring-gray-950/[0.10] placeholder:text-gray-400 transition-shadow focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-[12.5px] leading-relaxed text-red-700 bg-red-50 ring-1 ring-inset ring-red-600/15 rounded-lg px-3 py-2.5">
                {error}
                {lockedOut && (
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); setError(''); }}
                    className="block mt-1 font-semibold underline underline-offset-2"
                  >
                    Ask an administrator to reset your password
                  </button>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white text-[13.5px] font-medium py-2.5 rounded-lg transition-colors"
            >
              {loading && <Loader size={15} className="animate-spin" />}
              Sign In
            </button>
          </form>

          <button
            onClick={() => { setMode('forgot'); setError(''); }}
            className="mt-4 w-full text-center text-xs font-medium text-gray-500 hover:text-brand-600 transition-colors"
          >
            Forgot your password?
          </button>

          <p className="text-center text-xs text-gray-500 mt-4">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-brand-600 font-medium hover:underline">Create one</Link>
          </p>
          </>
        )}
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-6">
          © {new Date().getFullYear()} Squark Dashboard · Intellectual Property Management
        </p>
      </div>
    </div>
  );
}
