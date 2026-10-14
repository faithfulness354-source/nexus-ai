import NextAuth from 'next-auth';
import type { Adapter } from 'next-auth/adapters';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { isWhitelistedEmail } from '@/lib/admin';
import { consumeAuthToken } from '@/lib/auth-tokens';

function authLookupError(error: unknown): null {
  console.error('Auth database lookup failed', error instanceof Error ? error.message : '');
  return null;
}

/** A failed credentials or OAuth lookup returns null instead of an unhandled rejection. */
function lookupAdapter(adapter: Adapter): Adapter {
  return {
    ...adapter,
    async getUser(id) {
      try {
        return (await adapter.getUser?.(id)) ?? null;
      } catch (error) {
        return authLookupError(error);
      }
    },
    async getUserByEmail(email) {
      try {
        return (await adapter.getUserByEmail?.(email)) ?? null;
      } catch (error) {
        return authLookupError(error);
      }
    },
    async getUserByAccount(account) {
      try {
        return (await adapter.getUserByAccount?.(account)) ?? null;
      } catch (error) {
        return authLookupError(error);
      }
    },
    async getSessionAndUser(sessionToken) {
      try {
        return (await adapter.getSessionAndUser?.(sessionToken)) ?? null;
      } catch (error) {
        return authLookupError(error);
      }
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: lookupAdapter(PrismaAdapter(prisma)),
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: { email: { label: 'Email', type: 'email' }, password: { label: 'Password', type: 'password' } },
      async authorize(credentials) {
        const email = String(credentials?.email ?? '').trim().toLowerCase();
        try {
          const password = String(credentials?.password ?? '');
          if (!email || !password) {
            console.error('[auth] sign-in rejected', { provider: 'credentials', reason: 'missing-credentials' });
            return null;
          }
          const user = await prisma.user.findUnique({ where: { email } });
          if (!user?.password) {
            console.error('[auth] sign-in rejected', { provider: 'credentials', reason: 'unknown-account', whitelist: isWhitelistedEmail(email) });
            return null;
          }
          if (!(await bcrypt.compare(password, user.password))) {
            console.error('[auth] sign-in rejected', { provider: 'credentials', reason: 'password-mismatch', whitelist: isWhitelistedEmail(email) });
            return null;
          }
          const isAdmin = user.role === 'CREATOR_ADMIN' || user.isWhitelisted || isWhitelistedEmail(user.email);
          if (isWhitelistedEmail(user.email) && (user.role !== 'CREATOR_ADMIN' || !user.isWhitelisted)) {
            await prisma.user.update({ where: { id: user.id }, data: { role: 'CREATOR_ADMIN', isWhitelisted: true } });
          }
          return { id: user.id, email: user.email, name: user.name, role: isAdmin ? 'CREATOR_ADMIN' : 'USER' };
        } catch (error) {
          console.error('[auth] sign-in rejected', { provider: 'credentials', reason: 'lookup-failed', message: error instanceof Error ? error.message : '' });
          return null;
        }
      },
    }),
    // One-time emailed sign-in link (see /api/account/magic-link).
    Credentials({
      id: 'magic-link',
      name: 'Magic Link',
      credentials: { token: { label: 'Token', type: 'text' } },
      async authorize(credentials) {
        try {
          const email = await consumeAuthToken('magic', String(credentials?.token ?? ''));
          if (!email) {
            console.error('[auth] sign-in rejected', { provider: 'magic-link', reason: 'invalid-token' });
            return null;
          }
          const admin = isWhitelistedEmail(email);
          const user = await prisma.user.upsert({
            where: { email },
            update: { emailVerified: new Date(), ...(admin ? { role: 'CREATOR_ADMIN' as const, isWhitelisted: true } : {}) },
            create: { email, name: email.split('@')[0], emailVerified: new Date(), role: admin ? 'CREATOR_ADMIN' : 'USER', isWhitelisted: admin },
          });
          const isAdmin = user.role === 'CREATOR_ADMIN' || user.isWhitelisted || admin;
          return { id: user.id, email: user.email, name: user.name, role: isAdmin ? 'CREATOR_ADMIN' : 'USER' };
        } catch (error) {
          console.error('[auth] sign-in rejected', { provider: 'magic-link', reason: 'lookup-failed', message: error instanceof Error ? error.message : '' });
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role ?? 'USER';
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },
});
