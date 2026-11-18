import type { ControlMode } from '../robotics/types';

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
  accessToken?: string;
}

export interface UserProfile {
  userId: string;
  email: string;
  displayName: string;
  roleTitle: string;
  organization: string;
  bio: string;
  avatarColor: AvatarColor;
  defaultControlMode: ControlMode;
  showJointAxesDefault: boolean;
  updatedAt: string;
}

export interface EmailRegistrationRecord {
  id: string;
  email: string;
  fullName: string;
  roleTitle: string;
  organization: string;
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
  passwordHash: string;
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

export const ROLE_PRESETS = [
  'Robotics Engineer',
  'ML / Embodied AI Researcher',
  'Controls & Kinematics Lead',
  'Mechatronics Student',
  'Simulation Architect',
];

const KEYS = {
  accounts: 'axislab_accounts_v1',
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

function getSupabaseEnv(): { url: string; anonKey: string } | null {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    const url = env?.VITE_SUPABASE_URL?.trim() ?? '';
    const anonKey = env?.VITE_SUPABASE_ANON_KEY?.trim() ?? '';
    if (url.startsWith('http') && anonKey.length > 10) {
      return { url: url.replace(/\/$/, ''), anonKey };
    }
  } catch {
    // Running outside Vite (e.g., node:test)
  }
  return null;
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseEnv() !== null;
}

export function validateEmail(email: string): boolean {
  const normalized = email.trim();
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(normalized);
}

export function validatePassword(password: string): boolean {
  return password.length >= 6;
}

function simpleLocalHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `h_${(hash >>> 0).toString(16)}`;
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
  roleTitle?: string;
  organization?: string;
}): UserProfile {
  const fallbackName = params.email.split('@')[0] || 'Lab Operator';
  return {
    userId: params.userId,
    email: params.email.toLowerCase(),
    displayName: (params.displayName ?? '').trim() || fallbackName,
    roleTitle: (params.roleTitle ?? '').trim() || 'Robotics Engineer',
    organization: (params.organization ?? '').trim(),
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

export function signOutUser(): void {
  removeStorage(KEYS.session);
}

export function getProfile(userId: string): UserProfile | null {
  const profiles = readJsonRecord<UserProfile>(KEYS.profiles);
  return profiles[userId] ?? null;
}

export async function recordPublicEmailRegistration(params: {
  email: string;
  fullName?: string;
  roleTitle?: string;
  organization?: string;
  source?: string;
}): Promise<{ ok: true; record: EmailRegistrationRecord } | { ok: false; error: string }> {
  const email = params.email.trim().toLowerCase();
  if (!validateEmail(email)) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }

  const list = readJsonArray<EmailRegistrationRecord>(KEYS.emails);
  const existing = list.find((item) => item.email === email);
  const record: EmailRegistrationRecord = existing ?? {
    id: `reg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    email,
    fullName: (params.fullName ?? '').trim(),
    roleTitle: (params.roleTitle ?? '').trim() || 'Robotics Engineer',
    organization: (params.organization ?? '').trim(),
    source: params.source ?? 'landing_page',
    createdAt: new Date().toISOString(),
  };

  if (!existing) {
    writeStorage(KEYS.emails, JSON.stringify([record, ...list]));
  }

  const sb = getSupabaseEnv();
  if (sb && typeof fetch === 'function') {
    try {
      await fetch(`${sb.url}/rest/v1/email_registrations`, {
        method: 'POST',
        headers: {
          apikey: sb.anonKey,
          Authorization: `Bearer ${sb.anonKey}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=ignore-duplicates',
        },
        body: JSON.stringify({
          email: record.email,
          full_name: record.fullName,
          role_title: record.roleTitle,
          organization: record.organization,
          source: record.source,
        }),
      });
    } catch {
      // Local record already persisted safely
    }
  }

  return { ok: true, record };
}

export function listPublicEmailRegistrations(): EmailRegistrationRecord[] {
  return readJsonArray<EmailRegistrationRecord>(KEYS.emails);
}

export async function registerUserWithEmail(params: {
  email: string;
  password: string;
  displayName?: string;
  roleTitle?: string;
  organization?: string;
}): Promise<
  | { ok: true; session: UserSession; profile: UserProfile }
  | { ok: false; error: string }
> {
  const email = params.email.trim().toLowerCase();
  if (!validateEmail(email)) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }
  if (!validatePassword(params.password)) {
    return { ok: false, error: 'Password must be at least 6 characters.' };
  }

  const sb = getSupabaseEnv();
  if (sb && typeof fetch === 'function') {
    try {
      const res = await fetch(`${sb.url}/auth/v1/signup`, {
        method: 'POST',
        headers: {
          apikey: sb.anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password: params.password,
          data: {
            display_name: (params.displayName ?? '').trim(),
            role_title: (params.roleTitle ?? '').trim() || 'Robotics Engineer',
            organization: (params.organization ?? '').trim(),
          },
        }),
      });
      const data = (await res.json()) as {
        user?: { id: string; email?: string; created_at?: string };
        access_token?: string;
        msg?: string;
        error_description?: string;
      };
      if (!res.ok) {
        return {
          ok: false,
          error: data.error_description || data.msg || 'Supabase signup failed.',
        };
      }
      if (data.user?.id) {
        await recordPublicEmailRegistration({
          email,
          fullName: params.displayName,
          roleTitle: params.roleTitle,
          organization: params.organization,
          source: 'supabase_signup',
        });
        const session: UserSession = {
          userId: data.user.id,
          email,
          createdAt: data.user.created_at ?? new Date().toISOString(),
          provider: 'supabase',
          accessToken: data.access_token,
        };
        const profile = buildDefaultProfile({
          userId: session.userId,
          email,
          displayName: params.displayName,
          roleTitle: params.roleTitle,
          organization: params.organization,
        });
        const profiles = readJsonRecord<UserProfile>(KEYS.profiles);
        profiles[profile.userId] = profile;
        writeStorage(KEYS.profiles, JSON.stringify(profiles));
        writeStorage(KEYS.session, JSON.stringify(session));
        return { ok: true, session, profile };
      }
    } catch {
      return { ok: false, error: 'Network error connecting to Supabase Auth.' };
    }
  }

  // Local persistence mode (mirrors Supabase Auth + public email registration flow)
  const accounts = readJsonArray<StoredAccount>(KEYS.accounts);
  if (accounts.some((acc) => acc.email === email)) {
    return {
      ok: false,
      error: 'An account with this email already exists. Please sign in instead.',
    };
  }

  const userId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const account: StoredAccount = {
    userId,
    email,
    passwordHash: simpleLocalHash(`${email}:${params.password}`),
    createdAt: new Date().toISOString(),
  };
  writeStorage(KEYS.accounts, JSON.stringify([account, ...accounts]));

  await recordPublicEmailRegistration({
    email,
    fullName: params.displayName,
    roleTitle: params.roleTitle,
    organization: params.organization,
    source: 'registration_form',
  });

  const session: UserSession = {
    userId,
    email,
    createdAt: account.createdAt,
    provider: 'local',
  };
  writeStorage(KEYS.session, JSON.stringify(session));

  const profile = buildDefaultProfile({
    userId,
    email,
    displayName: params.displayName,
    roleTitle: params.roleTitle,
    organization: params.organization,
  });
  const profiles = readJsonRecord<UserProfile>(KEYS.profiles);
  profiles[userId] = profile;
  writeStorage(KEYS.profiles, JSON.stringify(profiles));

  return { ok: true, session, profile };
}

export async function signInUserWithEmail(params: {
  email: string;
  password: string;
}): Promise<
  | { ok: true; session: UserSession; profile: UserProfile }
  | { ok: false; error: string }
> {
  const email = params.email.trim().toLowerCase();
  if (!validateEmail(email)) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }
  if (!validatePassword(params.password)) {
    return { ok: false, error: 'Password must be at least 6 characters.' };
  }

  const sb = getSupabaseEnv();
  if (sb && typeof fetch === 'function') {
    try {
      const res = await fetch(`${sb.url}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          apikey: sb.anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password: params.password }),
      });
      const data = (await res.json()) as {
        user?: { id: string; email?: string; created_at?: string };
        access_token?: string;
        error_description?: string;
        msg?: string;
      };
      if (!res.ok || !data.user?.id) {
        return {
          ok: false,
          error: data.error_description || data.msg || 'Invalid email or password.',
        };
      }
      const session: UserSession = {
        userId: data.user.id,
        email,
        createdAt: data.user.created_at ?? new Date().toISOString(),
        provider: 'supabase',
        accessToken: data.access_token,
      };
      writeStorage(KEYS.session, JSON.stringify(session));
      const existingProfile =
        getProfile(session.userId) ??
        buildDefaultProfile({ userId: session.userId, email });
      return { ok: true, session, profile: existingProfile };
    } catch {
      return { ok: false, error: 'Unable to reach Supabase Auth.' };
    }
  }

  const accounts = readJsonArray<StoredAccount>(KEYS.accounts);
  const match = accounts.find((acc) => acc.email === email);
  if (!match) {
    return {
      ok: false,
      error: 'No account found for this email. Switch to Create Account to register.',
    };
  }
  if (match.passwordHash !== simpleLocalHash(`${email}:${params.password}`)) {
    return { ok: false, error: 'Incorrect password for this account.' };
  }

  const session: UserSession = {
    userId: match.userId,
    email: match.email,
    createdAt: match.createdAt,
    provider: 'local',
  };
  writeStorage(KEYS.session, JSON.stringify(session));

  const profiles = readJsonRecord<UserProfile>(KEYS.profiles);
  const profile =
    profiles[match.userId] ??
    buildDefaultProfile({ userId: match.userId, email: match.email });
  profiles[match.userId] = profile;
  writeStorage(KEYS.profiles, JSON.stringify(profiles));

  return { ok: true, session, profile };
}

export async function updateProfile(
  userId: string,
  patch: Partial<Omit<UserProfile, 'userId' | 'email' | 'updatedAt'>>,
): Promise<UserProfile | null> {
  const profiles = readJsonRecord<UserProfile>(KEYS.profiles);
  const existing = profiles[userId];
  if (!existing) return null;

  const updated: UserProfile = {
    ...existing,
    ...patch,
    displayName: (patch.displayName ?? existing.displayName).trim() || existing.displayName,
    roleTitle: (patch.roleTitle ?? existing.roleTitle).trim() || existing.roleTitle,
    organization: (patch.organization ?? existing.organization).trim(),
    bio: (patch.bio ?? existing.bio).trim(),
    updatedAt: new Date().toISOString(),
  };

  profiles[userId] = updated;
  writeStorage(KEYS.profiles, JSON.stringify(profiles));

  const sb = getSupabaseEnv();
  const session = getSession();
  if (sb && session?.provider === 'supabase' && session.accessToken && typeof fetch === 'function') {
    try {
      await fetch(`${sb.url}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: {
          apikey: sb.anonKey,
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          display_name: updated.displayName,
          role_title: updated.roleTitle,
          organization: updated.organization,
          bio: updated.bio,
          avatar_color: updated.avatarColor,
          default_control_mode: updated.defaultControlMode,
          show_joint_axes_default: updated.showJointAxesDefault,
          updated_at: updated.updatedAt,
        }),
      });
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

  const sb = getSupabaseEnv();
  if (sb && typeof fetch === 'function') {
    const session = getSession();
    try {
      await fetch(`${sb.url}/rest/v1/feedback`, {
        method: 'POST',
        headers: {
          apikey: sb.anonKey,
          Authorization: `Bearer ${session?.accessToken ?? sb.anonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: params.userId,
          email,
          category: params.category,
          rating,
          message,
          app_view: params.appView,
        }),
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
