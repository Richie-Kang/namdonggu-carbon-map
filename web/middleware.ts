import { NextResponse, type NextRequest } from 'next/server';

const ALLOWED_ORIGINS = new Set([
  'http://localhost:3000',
  process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : '',
].filter(Boolean));

// In-memory token bucket. Stateless edge → resets per instance.
// reason: For free-tier MVP. Upgrade to Upstash KV when traffic justifies.
const bucket = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 60;
const WINDOW_MS = 60_000;

function ipOf(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith('/api/')) {
    const ip = ipOf(req);
    const now = Date.now();
    const entry = bucket.get(ip);
    if (!entry || entry.resetAt < now) {
      bucket.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    } else {
      entry.count += 1;
      if (entry.count > LIMIT) {
        return new NextResponse(JSON.stringify({ error: 'rate_limited' }), {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((entry.resetAt - now) / 1000)),
            'Content-Type': 'application/json',
          },
        });
      }
    }
  }

  // CORS for /api
  if (req.nextUrl.pathname.startsWith('/api/')) {
    const origin = req.headers.get('origin');
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      // Allow same-origin requests (no Origin header from same origin in some browsers)
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
