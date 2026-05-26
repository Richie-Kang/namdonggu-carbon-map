import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

// reason: Two clients — public uses anon (RLS read-only); admin is server-only.
export const supabasePublic: SupabaseClient = createClient(url, anonKey, {
  auth: { persistSession: false },
});

export const supabaseAdmin: SupabaseClient =
  typeof window === 'undefined' && serviceKey
    ? createClient(url, serviceKey, { auth: { persistSession: false } })
    : supabasePublic;

export function browserClient(): SupabaseClient {
  return createClient(url, anonKey, { auth: { persistSession: false } });
}
