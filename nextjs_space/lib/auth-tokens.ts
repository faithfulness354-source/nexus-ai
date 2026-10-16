import 'server-only';
import crypto from 'crypto';
import { prisma } from '@/lib/db';

export type TokenPurpose = 'reset' | 'magic';

const TTL_MINUTES: Record<TokenPurpose, number> = { reset: 60, magic: 15 };

const hash = (raw: string) => crypto.createHash('sha256').update(raw).digest('hex');
const identifierFor = (purpose: TokenPurpose, email: string) => `${purpose}:${email}`;

/** Creates a single-use token (only its hash is stored) and invalidates older ones for the same email. */
export async function createAuthToken(purpose: TokenPurpose, email: string): Promise<string> {
  const identifier = identifierFor(purpose, email);
  const raw = crypto.randomBytes(32).toString('base64url');
  await prisma.verificationToken.deleteMany({ where: { identifier } });
  await prisma.verificationToken.create({
    data: { identifier, token: hash(raw), expires: new Date(Date.now() + TTL_MINUTES[purpose] * 60_000) },
  });
  return raw;
}

/** Consumes a token; returns the email it was issued for, or null if invalid/expired. */
export async function consumeAuthToken(purpose: TokenPurpose, raw: string): Promise<string | null> {
  if (!raw || raw.length < 20) return null;
  const record = await prisma.verificationToken.findUnique({ where: { token: hash(raw) } });
  if (!record || !record.identifier.startsWith(`${purpose}:`)) return null;
  await prisma.verificationToken.delete({ where: { token: record.token } }).catch(() => {});
  if (record.expires.getTime() < Date.now()) return null;
  return record.identifier.slice(purpose.length + 1);
}

/** Checks a token without consuming it. */
export async function peekAuthToken(purpose: TokenPurpose, raw: string): Promise<boolean> {
  if (!raw || raw.length < 20) return false;
  const record = await prisma.verificationToken.findUnique({ where: { token: hash(raw) } });
  return !!record && record.identifier.startsWith(`${purpose}:`) && record.expires.getTime() > Date.now();
}

// Short codes typed into the inline reset form. 8 chars from a 32-symbol alphabet (~1.1e12 combos),
// hashed together with the email so a code only works for the address it was sent to.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_TTL_MINUTES = 15;
const codeHash = (email: string, code: string) => hash(`code:${email}:${code.trim().toUpperCase().replace(/[\s-]/g, '')}`);

export async function createResetCode(email: string): Promise<string> {
  const identifier = `code:${email}`;
  const bytes = crypto.randomBytes(8);
  const code = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  await prisma.verificationToken.deleteMany({ where: { identifier } });
  await prisma.verificationToken.create({
    data: { identifier, token: codeHash(email, code), expires: new Date(Date.now() + CODE_TTL_MINUTES * 60_000) },
  });
  return code;
}

/** Single-use: returns true and deletes the code when it matches and hasn't expired. */
export async function consumeResetCode(email: string, code: string): Promise<boolean> {
  if (!code || code.trim().length < 6) return false;
  const record = await prisma.verificationToken.findUnique({ where: { token: codeHash(email, code) } });
  if (!record || record.identifier !== `code:${email}`) return false;
  await prisma.verificationToken.delete({ where: { token: record.token } }).catch(() => {});
  return record.expires.getTime() > Date.now();
}

export function appOrigin(request: Request): string {
  const h = request.headers;
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (host) {
    const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
    return `${proto.split(',')[0]}://${host.split(',')[0]}`;
  }
  return process.env.NEXTAUTH_URL ?? 'https://nexus-ai-navy-xi.vercel.app';
}

export const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export async function sendAuthEmail(opts: { to: string; subject: string; heading: string; intro: string; cta: string; url: string; expiresIn: string; code?: string }): Promise<{ delivered: boolean }> {
  const html = opts.code ? `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #0f0f12; color: #e5e5ef; padding: 32px; border-radius: 12px;">
      <h2 style="color: #a78bfa; margin: 0 0 16px;">${opts.heading}</h2>
      <p style="line-height: 1.6;">${opts.intro}</p>
      <p style="margin: 28px 0; font-size: 30px; letter-spacing: 6px; font-weight: bold; color: #fff; font-family: monospace;">${opts.code}</p>
      <p style="font-size: 13px; color: #a1a1b5;">This code expires in ${opts.expiresIn} and can be used once. If you didn't request it, you can ignore this email — your password stays unchanged.</p>
    </div>` : `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #0f0f12; color: #e5e5ef; padding: 32px; border-radius: 12px;">
      <h2 style="color: #a78bfa; margin: 0 0 16px;">${opts.heading}</h2>
      <p style="line-height: 1.6;">${opts.intro}</p>
      <p style="margin: 28px 0;">
        <a href="${opts.url}" style="background: #8b5cf6; color: #fff; padding: 12px 22px; border-radius: 8px; text-decoration: none; font-weight: bold;">${opts.cta}</a>
      </p>
      <p style="font-size: 13px; color: #a1a1b5;">This link expires in ${opts.expiresIn} and can be used once. If you didn't request it, you can ignore this email.</p>
      <p style="font-size: 12px; color: #71718a; word-break: break-all;">${opts.url}</p>
    </div>`;
  if (process.env.NODE_ENV !== 'production') {
    console.info(`[email] To ${opts.to}: ${opts.subject} (${html.length} chars)${opts.code ? ` code=${opts.code}` : ''}${opts.url ? ` ${opts.url}` : ''}`);
    return { delivered: false };
  }
  throw new Error('Email delivery is not configured');
}
