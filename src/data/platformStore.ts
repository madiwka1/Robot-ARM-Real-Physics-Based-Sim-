import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient';
import type { ControlMode } from '../robotics/types';

export { isSupabaseConfigured };

export type AvatarColor = 'amber' | 'sky' | 'emerald' | 'rose' | 'slate';

export type FeedbackCategory =
  | 'Feature Request'
  | 'Physics & Kinematics'
  | 'UI / Workflow'
  | 'Bug Report';

export interface UserSession {
  userId: string;
  /** Empty for local guests (no email is collected). */
  email: string;
  createdAt: string;
  /** 'local' = guest in this browser; 'supabase' = confirmed cloud account. */
  provider: 'local' | 'supabase';
  /** Sign-in method reported by Supabase ('email' | 'google'), for display. */
  authProvider?: string;
}

export interface UserProfile {
  userId: string;
  email: string;
  displayName: string;
  bio: string;
  avatarColor: AvatarColor;
  defaultControlMode: ControlMode;
  showJointAxesDefault: boolean;
  updatedAt: string;
}

export interface EmailRegistrationRecord {
  id: string;
  email: string;
  displayName: string;
  source: string;
  createdAt: string;
}

export interface FeedbackSubmission {
  id: string;
  userId: string | null;
  email: string;
  category: FeedbackCategory;
  rating: number;
  message: string;
  appView: 'landing' | 'simulator';
  createdAt: string;
}

interface StoredAccount {
  userId: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export const AVATAR_COLOR_OPTIONS: Array<{
  id: AvatarColor;
  label: string;
  bgClass: string;
  textClass: string;
}> = [
  { id: 'amber', label: 'Amber', bgClass: 'bg-amber-500', textClass: 'text-slate-950' },
  { id: 'sky', label: 'Cobalt', bgClass: 'bg-sky-500', textClass: 'text-slate-950' },
  { id: 'emerald', label: 'Emerald', bgClass: 'bg-emerald-500', textClass: 'text-slate-950' },
  { id: 'rose', label: 'Crimson', bgClass: 'bg-rose-500', textClass: 'text-white' },
  { id: 'slate', label: 'Graphite', bgClass: 'bg-slate-600', textClass: 'text-white' },
];

const KEYS = {
  session: 'axislab_session_v1',
  profiles: 'axislab_profiles_v1',
  feedback: 'axislab_feedback_v1',
} as const;

/** Keys written by older versions; purged by purgeLegacyLocalAccounts(). */
const LEGACY_KEYS = {
  accounts: 'axislab_accounts_v2',
  emails: 'axislab_email_registrations_v1',
} as const;

// In-memory fallback so pure Node unit tests work identically to browser localStorage
const memoryStorage = new Map<string, string>();

function readStorage(key: string): string | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return memoryStorage.get(key) ?? null;
    }
  }
  return memoryStorage.get(key) ?? null;
}

function writeStorage(key: string, value: string): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(key, value);
      return;
    } catch {
      // Fallback cleanly if quota exceeded
    }
  }
  memoryStorage.set(key, value);
}

function removeStorage(key: string): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(key);
      return;
    } catch {
      // Ignore
    }
  }
  memoryStorage.delete(key);
}

export function clearMemoryPlatformStoreForTests(): void {
  memoryStorage.clear();
}

/** Test hook: raw view of the in-memory store (keys and values). */
export function dumpMemoryPlatformStoreForTests(): Map<string, string> {
  return new Map(memoryStorage);
}

/** Test hook: seed a raw key (e.g. data written by older versions). */
export function seedMemoryPlatformStoreForTests(key: string, value: string): void {
  memoryStorage.set(key, value);
}

function readJsonArray<T>(key: string): T[] {
  const raw = readStorage(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function readJsonRecord<T>(key: string): Record<string, T> {
  const raw = readStorage(key);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, T>) : {};
  } catch {
    return {};
  }
}

export function validateEmail(email: string): boolean {
  const normalized = email.trim();
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(normalized);
}

export function validateDisplayName(displayName: string): boolean {
  return displayName.trim().length >= 2;
}

export function getInitials(displayName: string, email: string): string {
  const clean = displayName.trim();
  if (clean.length > 0) {
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase() || 'AL';
}

export function buildDefaultProfile(params: {
  userId: string;
  email: string;
  displayName?: string;
}): UserProfile {
  const fallbackName = params.email.split('@')[0] || 'Visitor';
  return {
    userId: params.userId,
    email: params.email.toLowerCase(),
    displayName: (params.displayName ?? '').trim() || fallbackName,
    bio: '',
    avatarColor: 'amber',
    defaultControlMode: 'joint',
    showJointAxesDefault: true,
    updatedAt: new Date().toISOString(),
  };
}

export function getSession(): UserSession | null {
  const raw = readStorage(KEYS.session);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserSession;
  } catch {
    return null;
  }
}

export async function signOutUser(): Promise<void> {
  removeStorage(KEYS.session);
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore network errors during sign-out
    }
  }
}

export function getProfile(userId: string): UserProfile | null {
  const profiles = readJsonRecord<UserProfile>(KEYS.profiles);
  const found = profiles[userId];
  if (!found) return null;
  return {
    userId: found.userId,
    email: found.email,
    displayName: found.displayName,
    bio: found.bio ?? '',
    avatarColor: found.avatarColor ?? 'amber',
    defaultControlMode: found.defaultControlMode ?? 'joint',
    showJointAxesDefault: found.showJointAxesDefault ?? true,
    updatedAt: found.updatedAt,
  };
}

function saveLocalProfile(profile: UserProfile): void {
  const profiles = readJsonRecord<UserProfile>(KEYS.profiles);
  profiles[profile.userId] = profile;
  writeStorage(KEYS.profiles, JSON.stringify(profiles));
}

export async function hydrateSupabaseSession(): Promise<{
  session: UserSession;
  profile: UserProfile;
} | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.user) return null;

    const user = data.session.user;
    const email = (user.email ?? '').toLowerCase();
    // Email sign-up stores display_name; Google provides full_name / name
    const meta = user.user_metadata ?? {};
    const metaName =
      [meta.display_name, meta.full_name, meta.name].find(
        (v): v is string => typeof v === 'string' && v.trim().length > 0,
      ) ?? '';

    const session: UserSession = {
      userId: user.id,
      email,
      createdAt: user.created_at ?? new Date().toISOString(),
      provider: 'supabase',
      authProvider: typeof user.app_metadata?.provider === 'string' ? user.app_metadata.provider : undefined,
    };
    writeStorage(KEYS.session, JSON.stringify(session));

    // Fetch the owner's profile row (RLS: only the owner can read it). Email is not stored there.
    const { data: row } = await supabase
      .from('profiles')
      .select(
        'id, display_name, bio, avatar_color, default_control_mode, show_joint_axes_default, updated_at',
      )
      .eq('id', user.id)
      .maybeSingle();

    const localExisting = getProfile(user.id);
    const profile: UserProfile = row
      ? {
          userId: row.id,
          email,
          displayName: row.display_name || metaName || email.split('@')[0] || 'Visitor',
          bio: row.bio ?? '',
          avatarColor: (row.avatar_color as AvatarColor) ?? 'amber',
          defaultControlMode: (row.default_control_mode as ControlMode) ?? 'joint',
          showJointAxesDefault: row.show_joint_axes_default ?? true,
          updatedAt: row.updated_at ?? new Date().toISOString(),
        }
      : localExisting ??
        buildDefaultProfile({
          userId: user.id,
          email,
          displayName: metaName,
        });

    saveLocalProfile(profile);
    return { session, profile };
  } catch {
    return null;
  }
}

export function subscribeToSupabaseAuth(
  onSessionChange: (payload: { session: UserSession; profile: UserProfile } | null) => void,
): () => void {
  const supabase = getSupabaseClient();
  if (!supabase) return () => {};

  const { data } = supabase.auth.onAuthStateChange(async (event, authSession) => {
    if (event === 'SIGNED_OUT' || !authSession?.user) {
      return;
    }
    const hydrated = await hydrateSupabaseSession();
    if (hydrated) {
      onSessionChange(hydrated);
    }
  });

  return () => {
    data.subscription.unsubscribe();
  };
}

/**
 * Accounts: 'cloud' when Supabase is configured (email magic link + Google OAuth), otherwise
 * 'guest' (no account: a random local id, no email collected, everything stays in this browser).
 *
 * Privacy model: the email lives only in Supabase Auth (never in a separate table or in
 * localStorage lists); profiles hold a display name and simulator preferences readable only by
 * their owner (RLS); a session exists only after Supabase confirms the user; users can delete
 * their account and all of its data.
 */
export type AuthMode = 'cloud' | 'guest';

export function getAuthMode(): AuthMode {
  return isSupabaseConfigured() ? 'cloud' : 'guest';
}

function authRedirectUrl(): string | undefined {
  return typeof window !== 'undefined' ? window.location.origin : undefined;
}

/**
 * Send a passwordless sign-in link. Works for new and returning users (Supabase creates the
 * account on first confirmation). Nothing is stored locally until the link is confirmed.
 */
export async function sendEmailSignInLink(params: {
  email: string;
  displayName?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = params.email.trim().toLowerCase();
  if (!validateEmail(email)) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false, error: 'Accounts are not connected on this deployment. Continue as a guest instead.' };
  }
  const displayName = (params.displayName ?? '').trim();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: authRedirectUrl(),
      ...(displayName ? { data: { display_name: displayName } } : {}),
    },
  });
  if (error) {
    const rateLimited = /rate limit|after \d+ second|too many requests/i.test(error.message ?? '');
    return {
      ok: false,
      error: rateLimited
        ? 'Too many sign-in emails were requested. Please wait a minute and try again.'
        : error.message || 'Could not send the sign-in link right now.',
    };
  }
  return { ok: true };
}

/** Redirects the browser to Google; the session arrives back via onAuthStateChange. */
export async function signInWithGoogle(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false, error: 'Google sign-in needs the Supabase connection configured.' };
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: authRedirectUrl() },
  });
  return error ? { ok: false, error: error.message || 'Google sign-in failed.' } : { ok: true };
}

function randomId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Local guest profile: no email, no account, nothing leaves this browser. */
export function startGuestSession(displayName?: string): { session: UserSession; profile: UserProfile } {
  const userId = `guest_${randomId()}`;
  const session: UserSession = {
    userId,
    email: '',
    createdAt: new Date().toISOString(),
    provider: 'local',
  };
  const profile = buildDefaultProfile({ userId, email: '', displayName: (displayName ?? '').trim() || 'Guest' });
  writeStorage(KEYS.session, JSON.stringify(session));
  saveLocalProfile(profile);
  return { session, profile };
}

/**
 * Delete the signed-in account and its data. Cloud: the `delete_my_account` RPC removes the
 * auth user; profiles and demonstrations cascade, feedback is anonymized. Guest: local data is
 * cleared. Either way the local session and profile are removed.
 */
export async function deleteAccount(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabaseClient();
  if (supabase && !userId.startsWith('guest_')) {
    const { error } = await supabase.rpc('delete_my_account');
    if (error) return { ok: false, error: error.message || 'Could not delete the account.' };
    try {
      await supabase.auth.signOut();
    } catch {
      // Already gone server-side
    }
  }
  const profiles = readJsonRecord<UserProfile>(KEYS.profiles);
  delete profiles[userId];
  writeStorage(KEYS.profiles, JSON.stringify(profiles));
  writeStorage(
    KEYS.feedback,
    JSON.stringify(readJsonArray<FeedbackSubmission>(KEYS.feedback).filter((f) => f.userId !== userId)),
  );
  removeStorage(KEYS.session);
  return { ok: true };
}

/**
 * Remove data older versions kept in localStorage: a plaintext list of every registered email
 * and password-less "accounts" anyone on the device could sign in to.
 */
export function purgeLegacyLocalAccounts(): void {
  removeStorage(LEGACY_KEYS.accounts);
  removeStorage(LEGACY_KEYS.emails);
  const session = getSession();
  if (session && (session.userId.startsWith('usr_') || session.userId.startsWith('sb_pending_'))) {
    removeStorage(KEYS.session);
  }
}

export async function updateProfile(
  userId: string,
  patch: Partial<Omit<UserProfile, 'userId' | 'email' | 'updatedAt'>>,
): Promise<UserProfile | null> {
  const existing = getProfile(userId);
  if (!existing) return null;

  const updated: UserProfile = {
    ...existing,
    ...patch,
    displayName: (patch.displayName ?? existing.displayName).trim() || existing.displayName,
    bio: (patch.bio ?? existing.bio).trim(),
    updatedAt: new Date().toISOString(),
  };

  saveLocalProfile(updated);

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user?.id === userId) {
        await supabase.from('profiles').upsert({
          id: userId,
          display_name: updated.displayName,
          bio: updated.bio,
          avatar_color: updated.avatarColor,
          default_control_mode: updated.defaultControlMode,
          show_joint_axes_default: updated.showJointAxesDefault,
          updated_at: updated.updatedAt,
        });
      }
    } catch {
      // Local profile persisted cleanly
    }
  }

  return updated;
}

export async function submitFeedback(params: {
  userId: string | null;
  email: string;
  category: FeedbackCategory;
  rating: number;
  message: string;
  appView: 'landing' | 'simulator';
}): Promise<{ ok: true; item: FeedbackSubmission } | { ok: false; error: string }> {
  const message = params.message.trim();
  const email = params.email.trim().toLowerCase();

  if (message.length < 3) {
    return { ok: false, error: 'Please write at least a few words of feedback.' };
  }
  if (email.length > 0 && !validateEmail(email)) {
    return { ok: false, error: 'Please enter a valid email address or leave it blank.' };
  }
  const rating = Math.max(1, Math.min(5, Math.round(params.rating)));

  const item: FeedbackSubmission = {
    id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    userId: params.userId,
    email,
    category: params.category,
    rating,
    message,
    appView: params.appView,
    createdAt: new Date().toISOString(),
  };

  const existing = readJsonArray<FeedbackSubmission>(KEYS.feedback);
  writeStorage(KEYS.feedback, JSON.stringify([item, ...existing].slice(0, 50)));

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      await supabase.from('feedback').insert({
        user_id: data.session?.user?.id ?? null,
        email,
        category: params.category,
        rating,
        message,
        app_view: params.appView,
      });
    } catch {
      // Local feedback stored safely
    }
  }

  return { ok: true, item };
}

export function listFeedback(): FeedbackSubmission[] {
  return readJsonArray<FeedbackSubmission>(KEYS.feedback);
}
