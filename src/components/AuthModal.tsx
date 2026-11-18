import React, { useState } from 'react';
import { X } from 'lucide-react';
import {
  isSupabaseConfigured,
  registerUserWithEmail,
  ROLE_PRESETS,
  signInUserWithEmail,
  type UserProfile,
  type UserSession,
} from '../data/platformStore';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onAuthSuccess: (session: UserSession, profile: UserProfile) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  open,
  onClose,
  onAuthSuccess,
}) => {
  const [tab, setTab] = useState<'register' | 'signin'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [roleTitle, setRoleTitle] = useState(ROLE_PRESETS[0]);
  const [organization, setOrganization] = useState('');
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
          password,
          displayName,
          roleTitle,
          organization,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        onAuthSuccess(res.session, res.profile);
        onClose();
      } else {
        const res = await signInUserWithEmail({ email, password });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        onAuthSuccess(res.session, res.profile);
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
      aria-label="AxisLab Account Registration and Sign In"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
    >
      <div className="w-full max-w-md rounded-lg border border-white/15 bg-[#141820] p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <h2 className="text-sm font-semibold text-slate-100">
            AxisLab 6 Account
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
                Create Account
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
              {isSupabaseConfigured() ? 'Supabase Auth' : 'Email Registry'}
            </span>
          </div>

          <label className="block space-y-1">
            <span className="block font-medium text-slate-300">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="engineer@axislab.dev"
              className="w-full rounded border border-white/15 bg-[#0d1015] px-3 py-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
            />
          </label>

          <label className="block space-y-1">
            <span className="block font-medium text-slate-300">Password</span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              className="w-full rounded border border-white/15 bg-[#0d1015] px-3 py-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
            />
          </label>

          {tab === 'register' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="block font-medium text-slate-300">Display Name</span>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Ada Vance"
                    className="w-full rounded border border-white/15 bg-[#0d1015] px-3 py-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="block font-medium text-slate-300">Role</span>
                  <select
                    value={roleTitle}
                    onChange={(e) => setRoleTitle(e.target.value)}
                    className="w-full rounded border border-white/15 bg-[#0d1015] px-2.5 py-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                  >
                    {ROLE_PRESETS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block space-y-1">
                <span className="block font-medium text-slate-300">
                  Organization (optional)
                </span>
                <input
                  type="text"
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  placeholder="Robotics Lab"
                  className="w-full rounded border border-white/15 bg-[#0d1015] px-3 py-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                />
              </label>
            </>
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
                ? 'Submitting...'
                : tab === 'register'
                  ? 'Register with Email'
                  : 'Sign In'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
