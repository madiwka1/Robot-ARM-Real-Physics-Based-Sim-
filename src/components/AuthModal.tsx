import React, { useState } from 'react';
import { X } from 'lucide-react';
import {
  isSupabaseConfigured,
  registerUserWithEmail,
  signInUserWithEmail,
  type UserProfile,
  type UserSession,
} from '../data/platformStore';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onAuthSuccess: (
    session: UserSession,
    profile: UserProfile,
    verificationEmailSent: boolean,
  ) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  open,
  onClose,
  onAuthSuccess,
}) => {
  const [tab, setTab] = useState<'register' | 'signin'>('register');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (tab === 'register') {
        const res = await registerUserWithEmail({
          email,
          displayName,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        onAuthSuccess(res.session, res.profile, res.verificationEmailSent);
        onClose();
      } else {
        const res = await signInUserWithEmail({ email });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        onAuthSuccess(res.session, res.profile, res.verificationEmailSent);
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="AxisLab 6 Account Registration and Sign In"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
    >
      <div className="w-full max-w-md rounded-lg border border-white/15 bg-[#141820] p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <h2 className="text-sm font-semibold text-slate-100">
            AxisLab 6 Registration
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Account Dialog"
            className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5 text-xs" noValidate>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 rounded bg-[#0d1015] p-1 border border-white/10">
              <button
                type="button"
                onClick={() => {
                  setTab('register');
                  setError(null);
                }}
                className={`rounded px-3 py-1 text-xs font-medium cursor-pointer ${
                  tab === 'register'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Register
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('signin');
                  setError(null);
                }}
                className={`rounded px-3 py-1 text-xs font-medium cursor-pointer ${
                  tab === 'signin'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Sign In
              </button>
            </div>
            <span className="text-[11px] text-slate-400">
              {isSupabaseConfigured() ? 'Supabase Auth' : 'Public Email Registry'}
            </span>
          </div>

          <label className="block space-y-1">
            <span className="block font-medium text-slate-300">Email Address</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded border border-white/15 bg-[#0d1015] px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
            />
          </label>

          {tab === 'register' && (
            <label className="block space-y-1">
              <span className="block font-medium text-slate-300">Display Name</span>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Alex Rivera"
                className="w-full rounded border border-white/15 bg-[#0d1015] px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
              />
            </label>
          )}

          {error && (
            <div
              role="alert"
              className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
            >
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-white/10 bg-[#1a202b] px-4 py-2 text-xs font-medium text-slate-200 hover:bg-[#232b3a] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
            >
              {submitting
                ? 'Saving...'
                : tab === 'register'
                  ? 'Register'
                  : 'Sign In'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
