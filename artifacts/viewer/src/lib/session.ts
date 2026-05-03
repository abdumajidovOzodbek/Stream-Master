const SESSION_KEY = "tg_session_id";
const IMPERSONATING_KEY = "tg_original_session_id";

function isValidUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export function getSessionId(): string {
  const stored = localStorage.getItem(SESSION_KEY);
  if (stored && isValidUUID(stored)) return stored;
  const fresh = crypto.randomUUID();
  localStorage.setItem(SESSION_KEY, fresh);
  return fresh;
}

export function setSessionId(id: string): void {
  localStorage.setItem(SESSION_KEY, id);
}

export function getOriginalSessionId(): string | null {
  return localStorage.getItem(IMPERSONATING_KEY);
}

export function startImpersonating(targetSessionId: string): void {
  const current = getSessionId();
  localStorage.setItem(IMPERSONATING_KEY, current);
  setSessionId(targetSessionId);
}

export function stopImpersonating(): void {
  const original = getOriginalSessionId();
  if (original) {
    setSessionId(original);
    localStorage.removeItem(IMPERSONATING_KEY);
  }
}

export function isImpersonating(): boolean {
  return !!getOriginalSessionId();
}
