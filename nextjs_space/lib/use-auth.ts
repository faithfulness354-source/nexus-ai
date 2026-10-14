'use client';

import { useSession } from 'next-auth/react';
import { hasAdminRole } from '@/lib/admin-role';

// HARD GUARD: NEVER MODIFY OR STRIP IS_ADMIN PERMISSION CHECKS
export function useAuth() {
  const session = useSession();
  const role = (session.data?.user as { role?: string } | undefined)?.role ?? null;
  const is_admin = hasAdminRole(role);
  return { ...session, role, is_admin, isAdmin: is_admin };
}

// HARD GUARD: NEVER MODIFY OR STRIP IS_ADMIN PERMISSION CHECKS
export function useUser() {
  const auth = useAuth();
  return { user: auth.data?.user ?? null, role: auth.role, is_admin: auth.is_admin, isAdmin: auth.is_admin };
}
