import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

const OPEN_API = [
  '/api/auth',
  '/api/account/tos',
  '/api/signup',
  '/api/live',
  '/api/health',
  '/api/account/magic-link',
  '/api/account/forgot-password',
  '/api/account/reset-password',
  '/api/account/quick-reset',
  '/api/webhooks',
];

function sessionCookieName(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-proto');
  const https = forwarded === 'https' || request.nextUrl.protocol === 'https:';
  return https ? '__Secure-authjs.session-token' : 'authjs.session-token';
}

function allowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (origin === 'https://localhost' || origin === 'http://localhost' || origin === 'capacitor://localhost') return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?$/.test(origin);
}

function corsHeaders(origin: string): Headers {
  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Vary', 'Origin');
  return headers;
}

export async function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const bearer = requestHeaders.get('authorization') ?? '';
  if (bearer.toLowerCase().startsWith('bearer ')) {
    const token = bearer.slice(7).trim();
    const name = sessionCookieName(request);
    const cookie = requestHeaders.get('cookie') ?? '';
    if (token && !cookie.includes(`${name}=`)) {
      requestHeaders.set('cookie', cookie ? `${cookie}; ${name}=${token}` : `${name}=${token}`);
    }
  }

  const origin = request.headers.get('origin');
  const allow = allowedOrigin(origin);
  if (request.method === 'OPTIONS' && allow && origin) {
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
  }

  const path = request.nextUrl.pathname;
  const open = OPEN_API.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  if (!open && request.method !== 'OPTIONS') {
    const session = await auth();
    const id = session?.user?.id;
    if (id) {
      const user = await prisma.user.findUnique({ where: { id }, select: { termsAcceptedAt: true } });
      if (user && !user.termsAcceptedAt) {
        const blocked = NextResponse.json({ error: 'Accept the Terms of Service to continue.' }, { status: 403 });
        if (allow && origin) corsHeaders(origin).forEach((value, key) => blocked.headers.set(key, value));
        return blocked;
      }
    }
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (allow && origin) {
    corsHeaders(origin).forEach((value, key) => response.headers.set(key, value));
  }
  return response;
}

export const config = { matcher: ['/api/:path*'] };
