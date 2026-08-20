import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://lygzlzkzkcexmlutnnob.supabase.co';
const supabasePublishableKey = 'sb_publishable_z2hW6JrKlQ4EZg3W-SYrLA_Voq2WovC';

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export async function ensureAnonymousUser() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (sessionData.session?.user) return sessionData.session.user;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  if (!data.user) throw new Error('Не удалось создать игровую сессию');
  return data.user;
}
