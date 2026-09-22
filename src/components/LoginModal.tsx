import { AlertCircle, Lock, ShieldCheck, Terminal } from 'lucide-react';
import React, { useState } from 'react';
import { AuthService } from '../services/api';
import { User } from '../types';

interface LoginModalProps {
  isOpen: boolean;
  onLoginSuccess: (user: User) => void;
}

// Set VITE_DEV_LOGIN=true in your .env.local to enable the dev login bypass
const IS_DEV_LOGIN = import.meta.env.VITE_DEV_LOGIN === 'true';

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onLoginSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [devEmail, setDevEmail] = useState('admin@martechlabs.io');
  const [errorMsg, setErrorMsg] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get('auth_error');
    return err === 'access_denied'
      ? 'Access denied: your Google account is not whitelisted. Contact HR to provision your account.'
      : null;
  });

  const handleGoogleSignIn = () => {
    setLoading(true);
    AuthService.loginWithGoogle();
  };

  const handleDevLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    try {
      const user = await AuthService.devLogin(devEmail.trim().toLowerCase());
      onLoginSuccess(user);
    } catch (err: any) {
      setErrorMsg(err.message ?? 'Dev login failed');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 max-w-sm w-full p-8 text-center animate-in fade-in duration-200">

        {/* Brand */}
        <div className="w-12 h-12 rounded-xl bg-zinc-900 text-white flex items-center justify-center mx-auto shadow-xs mb-4">
          <span className="font-extrabold text-lg tracking-wider">M</span>
        </div>

        <h2 className="text-lg font-bold text-zinc-900 tracking-tight">MMG-HR</h2>
        <p className="text-xs text-zinc-500 mt-1">Momentum Marketing Group Leave Management System</p>

        {IS_DEV_LOGIN ? (
          /* ── Development login bypass ───────────────────────────────── */
          <div className="mt-5">
            <div className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-left mb-4">
              <Terminal className="w-4 h-4 text-amber-600 shrink-0" />
              <p className="text-xs text-amber-800 font-medium">
                Dev mode — OAuth bypassed. Pick any seeded email below.
              </p>
            </div>

            <form onSubmit={handleDevLogin} className="space-y-3 text-left">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Email address</label>
                <input
                  type="email"
                  value={devEmail}
                  onChange={(e) => setDevEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-xs font-mono text-zinc-900 focus:ring-2 focus:ring-zinc-900 outline-hidden"
                  placeholder="admin@martechlabs.io"
                  required
                />
              </div>

              {/* Quick-pick buttons — one verified account per role */}
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { label: 'SuperAdmin', email: 'admin@martechlabs.io' },
                  { label: 'Manager', email: 'leila.b@martechlabs.io' },
                  { label: 'Employee', email: 'sarra.k@martechlabs.io' },
                ].map(({ label, email }) => (
                  <button
                    key={email}
                    type="button"
                    onClick={() => setDevEmail(email)}
                    className={`px-2 py-1.5 rounded-lg border text-[11px] font-medium text-left transition-colors cursor-pointer ${
                      devEmail === email
                        ? 'border-zinc-900 bg-zinc-900 text-white'
                        : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    <span className="block font-semibold">{label}</span>
                    <span className="block text-[10px] opacity-70 truncate">{email.split('@')[0]}</span>
                  </button>
                ))}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer"
              >
                {loading ? 'Signing in…' : 'Sign In (Dev)'}
              </button>
            </form>
          </div>
        ) : (
          /* ── Production Google OAuth ─────────────────────────────────── */
          <>
            <div className="mt-5 p-3 bg-zinc-50 rounded-xl border border-zinc-200/80 text-left flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-zinc-600 shrink-0 mt-0.5" />
              <p className="text-xs text-zinc-600 leading-relaxed">
                Sign in with your <strong>company Google account</strong>. Only pre-approved
                emails can get in.
              </p>
            </div>

            <button
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="mt-5 w-full py-3 px-4 bg-white border border-zinc-200 hover:bg-zinc-50 hover:border-zinc-300 rounded-xl text-sm font-semibold text-zinc-700 shadow-xs flex items-center justify-center gap-3 transition-all cursor-pointer disabled:opacity-60"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>{loading ? 'Redirecting…' : 'Sign in with Google Workspace'}</span>
            </button>

            <p className="mt-5 text-[11px] text-zinc-400">
              Don't have access?{' '}
              <span className="font-semibold text-zinc-600">Ask your HR administrator</span>{' '}
              to set up your account.
            </p>
          </>
        )}

        {/* Error */}
        {errorMsg && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2 text-left">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-zinc-400">
          <Lock className="w-3 h-3" />
          <span>
            {IS_DEV_LOGIN ? 'Dev mode — no OAuth required' : 'Secured with OAuth 2.0 + JWT · Momentum Marketing Group'}
          </span>
        </div>
      </div>
    </div>
  );
};
