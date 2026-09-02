import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://lygzlzkzkcexmlutnnob.supabase.co';
const supabasePublishableKey = 'sb_publishable_z2hW6JrKlQ4EZg3W-SYrLA_Voq2WovC';
const devRoleKey = 'blitzzz:dev-multiplayer-role';
const devMultiplayerEnabled = process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_ENABLE_DEV_MULTIPLAYER === 'true';

export type DevMultiplayerRole = 'host' | 'guest';

function createSupabaseClient(storageKey?: string) {
  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, ...(storageKey ? { storageKey } : {}) },
  });
}

const isBrowserDev = devMultiplayerEnabled && typeof window !== 'undefined';
const devClients: Partial<Record<DevMultiplayerRole, SupabaseClient>> = {};

export function getDevMultiplayerRole(): DevMultiplayerRole {
  if (typeof window === 'undefined') return 'host';
  return window.localStorage.getItem(devRoleKey) === 'guest' ? 'guest' : 'host';
}

export function setDevMultiplayerRole(role: DevMultiplayerRole) {
  window.localStorage.setItem(devRoleKey, role);
}

export function getDevSupabaseClient(role: DevMultiplayerRole) {
  const existing = devClients[role];
  if (existing) return existing;
  const client = createSupabaseClient(`blitzzz:auth:${role}`);
  devClients[role] = client;
  return client;
}

export const supabase = isBrowserDev
  ? getDevSupabaseClient(getDevMultiplayerRole())
  : createSupabaseClient();

export async function ensureAnonymousUser(client: SupabaseClient = supabase) {
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (sessionData.session?.user) return sessionData.session.user;

  const { data, error } = await client.auth.signInAnonymously();
  if (error) throw error;
  if (!data.user) throw new Error('Не удалось создать игровую сессию');
  return data.user;
}
