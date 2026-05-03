const SESSION_KEY = "tg_session_id";
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

function isValidUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function writeCookie(id: string): void {
  document.cookie = `${SESSION_KEY}=${id}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function getSessionId(): string {
  const stored = localStorage.getItem(SESSION_KEY);
  if (stored && isValidUUID(stored)) {
    writeCookie(stored);
    return stored;
  }
  const fresh = crypto.randomUUID();
  localStorage.setItem(SESSION_KEY, fresh);
  writeCookie(fresh);
  return fresh;
}
