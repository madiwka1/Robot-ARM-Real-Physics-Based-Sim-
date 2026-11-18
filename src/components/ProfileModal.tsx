import React, { useEffect, useState } from 'react';
import { Check, LogOut, X } from 'lucide-react';
import {
  AVATAR_COLOR_OPTIONS,
  getInitials,
  updateProfile,
  type AvatarColor,
  type UserProfile,
} from '../data/platformStore';
import type { ControlMode } from '../robotics/types';

interface ProfileModalProps {
  open: boolean;
  profile: UserProfile | null;
  onClose: () => void;
  onProfileSaved: (updated: UserProfile) => void;
  onSignOut: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  open,
  profile,
  onClose,
  onProfileSaved,
  onSignOut,
}) => {
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarColor, setAvatarColor] = useState<AvatarColor>('amber');
  const [defaultControlMode, setDefaultControlMode] = useState<ControlMode>('joint');
  const [showJointAxesDefault, setShowJointAxesDefault] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    if (open && profile) {
      setDisplayName(profile.displayName);
      setBio(profile.bio);
      setAvatarColor(profile.avatarColor);
      setDefaultControlMode(profile.defaultControlMode);
      setShowJointAxesDefault(profile.showJointAxesDefault);
      setSavedNotice(false);
    }
    // Only re-sync fields when modal opens or active user changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, profile?.userId]);

  if (!open || !profile) return null;

  const activeColor =
    AVATAR_COLOR_OPTIONS.find((c) => c.id === avatarColor) ?? AVATAR_COLOR_OPTIONS[0];

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await updateProfile(profile.userId, {
        displayName,
        bio,
        avatarColor,
        defaultControlMode,
        showJointAxesDefault,
      });
      if (updated) {
        onProfileSaved(updated);
        setSavedNotice(true);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Profile Customization"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
    >
      <div className="w-full max-w-lg rounded-lg border border-white/15 bg-[#141820] p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <h2 className="text-sm font-semibold text-slate-100">
            Customize Profile
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Profile Modal"
            className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="mt-4 space-y-4 text-xs">
          {/* Live Avatar & Color Picker */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-white/10 bg-[#0d1015] p-3">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-md text-sm font-bold ${activeColor.bgClass} ${activeColor.textClass}`}
              >
                {getInitials(displayName || profile.displayName, profile.email)}
              </div>
              <div>
                <div className="font-semibold text-slate-100">
                  {displayName.trim() || profile.displayName}
                </div>
                <div className="font-mono-tabular text-[11px] text-slate-400">
                  {profile.email}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2" role="group" aria-label="Avatar Accent Color">
              {AVATAR_COLOR_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  aria-label={`Avatar color ${opt.label}`}
                  aria-pressed={avatarColor === opt.id}
                  onClick={() => setAvatarColor(opt.id)}
                  className={`flex h-6 w-6 items-center justify-center rounded-full ${opt.bgClass} ${opt.textClass} cursor-pointer ${
                    avatarColor === opt.id ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0d1015]' : 'opacity-75 hover:opacity-100'
                  }`}
                >
                  {avatarColor === opt.id && <Check className="h-3 w-3" />}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="block font-medium text-slate-300">Display Name</span>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded border border-white/15 bg-[#0d1015] px-3 py-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
              />
            </label>

            <label className="block space-y-1">
              <span className="block font-medium text-slate-300">About / Notes</span>
              <textarea
                rows={2}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="What are you building, testing, or exploring in AxisLab 6?"
                className="w-full rounded border border-white/15 bg-[#0d1015] px-3 py-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
              />
            </label>
          </div>

          {/* Simulator Preferences */}
          <div className="space-y-2.5 rounded-md border border-white/10 bg-[#0d1015] p-3">
            <div className="font-semibold text-slate-200">Simulator Preferences</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="block text-slate-400">Default Control Mode</span>
                <select
                  value={defaultControlMode}
                  onChange={(e) => setDefaultControlMode(e.target.value as ControlMode)}
                  className="w-full rounded border border-white/15 bg-[#141820] px-2.5 py-1.5 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                >
                  <option value="joint">Joint Control (J1–J6)</option>
                  <option value="ik">Direct IK Manipulation</option>
                </select>
              </label>

              <label className="flex items-center gap-2 pt-5 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showJointAxesDefault}
                  onChange={(e) => setShowJointAxesDefault(e.target.checked)}
                  className="h-4 w-4 accent-amber-500"
                />
                <span>Show Joint Coordinate Axes</span>
              </label>
            </div>
          </div>

          {savedNotice && (
            <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
              Profile and simulator preferences saved.
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => {
                onSignOut();
                onClose();
              }}
              className="inline-flex items-center gap-1.5 rounded px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/15 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign Out</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-white/10 bg-[#1a202b] px-4 py-2 text-xs font-medium text-slate-200 hover:bg-[#232b3a] cursor-pointer"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
              >
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
