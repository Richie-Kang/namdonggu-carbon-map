import { NextResponse, type NextRequest } from 'next/server';

// reason: Optional Upstash KV for shared rate limiting (P1 fix).
// Without these env vars we fall back to in-memory limiter (per-instance).
const KV_URL = process.env.UPSTASH_REDIS_REST_URL ?? '';
const KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? '';

const LIMIT = 60;
const WINDOW_SECONDS = 60;

const memBucket = new Map<string, { count: number; resetAt: number }>();

function buildOrigins(): Set<string> {
  const set = new Set<string>(['http://localhost:3000']);
  const vercel = process.env.NEXT_PUBLIC_VERCEL_URL;
  if (vercel) set.add(`https://${vercel}`);
  const extra = process.env.NEXT_PUBLIC_ALLOWED_ORIGIN;
  if (extra) set.add(extra);
  return set;
}

const ALLOWED_ORIGINS = buildOrigins();

function ipOf(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

async function kvIncrement(key: string): Promise<{ count: number; ttl: number } | null> {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const incrRes = await fetch(`${KV_URL}/incr/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
      cache: 'no-store',
    });
    if (!incrRes.ok) return null;
    const incrBody = (await incrRes.json()) as { result?: number };
    const count = incrBody.result ?? 0;
    if (count === 1) {
      await fetch(`${KV_URL}/expire/${encodeURIComponent(key)}/${WINDOW_SECONDS}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` },
        cache: 'no-store',
      });
    }
    return { count, ttl: WINDOW_SECONDS };
  } catch {
    return null;
  }
}

function memIncrement(key: string): { count: number; ttl: number } {
  const now = Date.now();
  const entry = memBucket.get(key);
  if (!entry || entry.resetAt < now) {
    memBucket.set(key, { count: 1, resetAt: now + WINDOW_SECONDS * 1000 });
    return { count: 1, ttl: WINDOW_SECONDS };
  }
  entry.count += 1;
  return { count: entry.count, ttl: Math.ceil((entry.resetAt - now) / 1000) };
}

function corsResponse(status: number, body: unknown, origin: string | null): NextResponse {
  const res = NextResponse.json(body, { status });
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.headers.set('Access-Control-Allow-Origin', origin);
    res.headers.set('Vary', 'Origin');
    res.headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  return res;
}

export async function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith('/api/')) return NextResponse.next();
  const origin = req.headers.get('origin');

  // CORS allow-list enforcement (P1 fix)
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return corsResponse(403, { error: 'cors_origin_not_allowed' }, origin);
  }
  if (req.method === 'OPTIONS') {
    return corsResponse(204, null, origin);
  }

  const ip = ipOf(req);
  const key = `rl:${ip}:${new Date().getUTCMinutes()}`;
  const tick = (await kvIncrement(key)) ?? memIncrement(key);
  if (tick.count > LIMIT) {
    const res = corsResponse(429, { error: 'rate_limited' }, origin);
    res.headers.set('Retry-After', String(Math.max(1, tick.ttl)));
    return res;
  }

  const next = NextResponse.next();
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    next.headers.set('Access-Control-Allow-Origin', origin);
    next.headers.set('Vary', 'Origin');
  }
  return next;
}

export const config = { matcher: ['/api/:path*'] };
