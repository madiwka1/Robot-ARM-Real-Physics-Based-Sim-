import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null | undefined;

export function getSupabaseConfig(): { url: string; anonKey: string } | null {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> })
      .env;
    const rawUrl = env?.VITE_SUPABASE_URL?.trim() ?? '';
    const anonKey = env?.VITE_SUPABASE_ANON_KEY?.trim() ?? '';
    if (rawUrl.startsWith('http') && anonKey.length > 10) {
      const normalizedUrl = new URL(rawUrl).origin;
      return { url: normalizedUrl, anonKey };
    }
  } catch {
    // Safe fallback outside Vite (e.g. Node unit tests)
  }
  return null;
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}

export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient !== undefined) {
    return cachedClient;
  }
  const cfg = getSupabaseConfig();
  if (!cfg) {
    cachedClient = null;
    return null;
  }
  cachedClient = createClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return cachedClient;
}
