/**
 * In-memory map: adminSessionId → targetSessionId
 * When an admin is impersonating a user, every request from that admin's
 * session transparently uses the target's TelegramClient instead.
 */
const store = new Map<string, string>();

export function startImpersonation(adminSessionId: string, targetSessionId: string): void {
  store.set(adminSessionId, targetSessionId);
}

export function stopImpersonation(adminSessionId: string): void {
  store.delete(adminSessionId);
}

export function getImpersonationTarget(adminSessionId: string): string | null {
  return store.get(adminSessionId) ?? null;
}

export function isImpersonating(adminSessionId: string): boolean {
  return store.has(adminSessionId);
}
