// HARD GUARD: NEVER MODIFY OR STRIP IS_ADMIN PERMISSION CHECKS
export function hasAdminRole(role?: string | null, isAdminFlag?: boolean | null): boolean {
  if (isAdminFlag === true) return true;
  const value = String(role ?? '').trim().toLowerCase();
  return value === 'admin' || value === 'creator_admin';
}
