import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// reason: Vercel CLI repeatedly registered our env values as empty strings
// (PMTILES, SUPABASE) which broke production. Hard-coding the public
// Supabase URL + anon key is safe — they are NEXT_PUBLIC by design and
// already shipped to every browser. RLS read-only policy protects writes.
// Service role key stays env-only (never in code, never in git).
const PUBLIC_SUPABASE_URL = 'https://jsosoyaeeblnmdeeaubr.supabase.co';
const PUBLIC_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impzb3NveWFlZWJsbm1kZWVhdWJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3OTIyNDgsImV4cCI6MjA5NTM2ODI0OH0.LsFznPqZeFHayT3-BTmcSQe2bAenu0rtSnU6HD4y8jQ';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || PUBLIC_SUPABASE_ANON_KEY;
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
