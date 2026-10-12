import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { isWhitelistedEmail } from '@/lib/admin';
import { consumeAuthToken } from '@/lib/auth-tokens';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: { email: { label: 'Email', type: 'email' }, password: { label: 'Password', type: 'password' } },
      async authorize(credentials) {
        const email = String(credentials?.email ?? '').trim().toLowerCase();
        const password = String(credentials?.password ?? '');
        if (!email || !password) return null;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.password || !(await bcrypt.compare(password, user.password))) return null;
        const isAdmin = user.role === 'CREATOR_ADMIN' || user.isWhitelisted || isWhitelistedEmail(user.email);
        if (isWhitelistedEmail(user.email) && (user.role !== 'CREATOR_ADMIN' || !user.isWhitelisted)) {
          await prisma.user.update({ where: { id: user.id }, data: { role: 'CREATOR_ADMIN', isWhitelisted: true } });
        }
        return { id: user.id, email: user.email, name: user.name, role: isAdmin ? 'CREATOR_ADMIN' : 'USER' };
      },
    }),
    // One-time emailed sign-in link (see /api/account/magic-link).
    Credentials({
      id: 'magic-link',
      name: 'Magic Link',
      credentials: { token: { label: 'Token', type: 'text' } },
      async authorize(credentials) {
        const email = await consumeAuthToken('magic', String(credentials?.token ?? ''));
        if (!email) return null;
        const admin = isWhitelistedEmail(email);
        const user = await prisma.user.upsert({
          where: { email },
          update: { emailVerified: new Date(), ...(admin ? { role: 'CREATOR_ADMIN' as const, isWhitelisted: true } : {}) },
          create: { email, name: email.split('@')[0], emailVerified: new Date(), role: admin ? 'CREATOR_ADMIN' : 'USER', isWhitelisted: admin },
        });
        const isAdmin = user.role === 'CREATOR_ADMIN' || user.isWhitelisted || admin;
        return { id: user.id, email: user.email, name: user.name, role: isAdmin ? 'CREATOR_ADMIN' : 'USER' };
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
