// Hardcoded creator/admin whitelist. These accounts bypass every paywall and limit.
export const ADMIN_WHITELIST = ['faithfulness354@gmail.com'];

export function isWhitelistedEmail(email?: string | null): boolean {
  return !!email && ADMIN_WHITELIST.includes(email.trim().toLowerCase());
}
