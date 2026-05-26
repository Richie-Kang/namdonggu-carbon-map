import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// reason: at build time (Next "Collecting page data") top-level createClient
// runs with whatever env Vercel injected; missing vars used to throw
// "supabaseUrl is required" and kill the whole build. Fallback to a stub
// URL so the build proceeds — real env still wins at runtime.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://stub.supabase.co';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'stub';
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
