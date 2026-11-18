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
  email: string;
  createdAt: string;
  provider: 'local' | 'supabase';
  pendingEmailVerification?: boolean;
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
  accounts: 'axislab_accounts_v2',
  session: 'axislab_session_v1',
  profiles: 'axislab_profiles_v1',
  emails: 'axislab_email_registrations_v1',
  feedback: 'axislab_feedback_v1',
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
    const metaName =
      typeof user.user_metadata?.display_name === 'string'
        ? user.user_metadata.display_name
        : '';

    const session: UserSession = {
      userId: user.id,
      email,
      createdAt: user.created_at ?? new Date().toISOString(),
      provider: 'supabase',
      pendingEmailVerification: false,
    };
    writeStorage(KEYS.session, JSON.stringify(session));

    // Fetch remote profile row if present
    const { data: row } = await supabase
      .from('profiles')
      .select(
        'id, email, display_name, bio, avatar_color, default_control_mode, show_joint_axes_default, updated_at',
      )
      .eq('id', user.id)
      .maybeSingle();

    const localExisting = getProfile(user.id);
    const profile: UserProfile = row
      ? {
          userId: row.id,
          email: (row.email || email).toLowerCase(),
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

export async function recordPublicEmailRegistration(params: {
  email: string;
  displayName?: string;
  source?: string;
}): Promise<{ ok: true; record: EmailRegistrationRecord } | { ok: false; error: string }> {
  const email = params.email.trim().toLowerCase();
  if (!validateEmail(email)) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }

  const displayName = (params.displayName ?? '').trim();
  const list = readJsonArray<EmailRegistrationRecord>(KEYS.emails);
  const existing = list.find((item) => item.email === email);
  const record: EmailRegistrationRecord = existing ?? {
    id: `reg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    email,
    displayName,
    source: params.source ?? 'public_registration',
    createdAt: new Date().toISOString(),
  };

  if (!existing) {
    writeStorage(KEYS.emails, JSON.stringify([record, ...list]));
  } else if (displayName && !existing.displayName) {
    const updatedList = list.map((item) =>
      item.email === email ? { ...item, displayName } : item,
    );
    writeStorage(KEYS.emails, JSON.stringify(updatedList));
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.from('email_registrations').insert({
        email: record.email,
        display_name: displayName || record.displayName,
        source: record.source,
      });
    } catch {
      // Ignore duplicate / network errors cleanly since local record is saved
    }
  }

  return { ok: true, record };
}

export function listPublicEmailRegistrations(): EmailRegistrationRecord[] {
  return readJsonArray<EmailRegistrationRecord>(KEYS.emails);
}

export async function registerUserWithEmail(params: {
  email: string;
  displayName: string;
}): Promise<
  | {
      ok: true;
      session: UserSession;
      profile: UserProfile;
      verificationEmailSent: boolean;
    }
  | { ok: false; error: string }
> {
  const email = params.email.trim().toLowerCase();
  const displayName = params.displayName.trim();

  if (!validateEmail(email)) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }
  if (!validateDisplayName(displayName)) {
    return { ok: false, error: 'Please enter a display name (at least 2 characters).' };
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    // 1. Store email + display name under public RLS insert policy
    const publicRes = await recordPublicEmailRegistration({
      email,
      displayName,
      source: 'public_registration',
    });
    if (!publicRes.ok) {
      return publicRes;
    }

    // 2. Trigger passwordless email OTP / magic link via Supabase Auth
    const redirectTo =
      typeof window !== 'undefined' ? window.location.origin : undefined;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: redirectTo,
        data: {
          display_name: displayName,
        },
      },
    });

    if (error) {
      const msg = error.message || '';
      const isRateLimit = /rate limit|after \d+ second|too many requests/i.test(msg);
      if (!isRateLimit) {
        return {
          ok: false,
          error: msg || 'Unable to register with Supabase Auth right now.',
        };
      }
      // Public email registration was saved; fall back to local active profile when Supabase SMTP rate-limit is reached
      const userId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const session: UserSession = {
        userId,
        email,
        createdAt: new Date().toISOString(),
        provider: 'local',
        pendingEmailVerification: false,
      };
      const profile = buildDefaultProfile({
        userId,
        email,
        displayName,
      });
      writeStorage(KEYS.session, JSON.stringify(session));
      saveLocalProfile(profile);
      return {
        ok: true,
        session,
        profile,
        verificationEmailSent: false,
      };
    }

    const userId = `sb_pending_${email}`;
    const session: UserSession = {
      userId,
      email,
      createdAt: new Date().toISOString(),
      provider: 'supabase',
      pendingEmailVerification: true,
    };
    const profile = buildDefaultProfile({
      userId,
      email,
      displayName,
    });
    writeStorage(KEYS.session, JSON.stringify(session));
    saveLocalProfile(profile);

    return {
      ok: true,
      session,
      profile,
      verificationEmailSent: true,
    };
  }

  // Local persistence mode (mirrors public registration + Supabase profile shape)
  const accounts = readJsonArray<StoredAccount>(KEYS.accounts);
  if (accounts.some((acc) => acc.email === email)) {
    return {
      ok: false,
      error: 'This email is already registered. Switch to Sign In to continue.',
    };
  }

  const userId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const account: StoredAccount = {
    userId,
    email,
    displayName,
    createdAt: new Date().toISOString(),
  };
  writeStorage(KEYS.accounts, JSON.stringify([account, ...accounts]));

  await recordPublicEmailRegistration({
    email,
    displayName,
    source: 'public_registration',
  });

  const session: UserSession = {
    userId,
    email,
    createdAt: account.createdAt,
    provider: 'local',
    pendingEmailVerification: false,
  };
  writeStorage(KEYS.session, JSON.stringify(session));

  const profile = buildDefaultProfile({
    userId,
    email,
    displayName,
  });
  saveLocalProfile(profile);

  return {
    ok: true,
    session,
    profile,
    verificationEmailSent: false,
  };
}

export async function signInUserWithEmail(params: {
  email: string;
}): Promise<
  | {
      ok: true;
      session: UserSession;
      profile: UserProfile;
      verificationEmailSent: boolean;
    }
  | { ok: false; error: string }
> {
  const email = params.email.trim().toLowerCase();
  if (!validateEmail(email)) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    const redirectTo =
      typeof window !== 'undefined' ? window.location.origin : undefined;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: redirectTo,
      },
    });
    if (error) {
      return {
        ok: false,
        error:
          error.message ||
          'Unable to sign in. Make sure this email is registered first.',
      };
    }

    const userId = `sb_pending_${email}`;
    const existing = getProfile(userId);
    const session: UserSession = {
      userId,
      email,
      createdAt: new Date().toISOString(),
      provider: 'supabase',
      pendingEmailVerification: true,
    };
    const profile =
      existing ??
      buildDefaultProfile({
        userId,
        email,
      });
    writeStorage(KEYS.session, JSON.stringify(session));
    saveLocalProfile(profile);

    return {
      ok: true,
      session,
      profile,
      verificationEmailSent: true,
    };
  }

  const accounts = readJsonArray<StoredAccount>(KEYS.accounts);
  const match = accounts.find((acc) => acc.email === email);
  if (!match) {
    return {
      ok: false,
      error: 'No registration found for this email. Switch to Register to create one.',
    };
  }

  const session: UserSession = {
    userId: match.userId,
    email: match.email,
    createdAt: match.createdAt,
    provider: 'local',
    pendingEmailVerification: false,
  };
  writeStorage(KEYS.session, JSON.stringify(session));

  const profile =
    getProfile(match.userId) ??
    buildDefaultProfile({
      userId: match.userId,
      email: match.email,
      displayName: match.displayName,
    });
  saveLocalProfile(profile);

  return {
    ok: true,
    session,
    profile,
    verificationEmailSent: false,
  };
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
          email: updated.email,
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
