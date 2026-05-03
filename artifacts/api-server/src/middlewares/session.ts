import { type Request, type Response, type NextFunction } from "express";
import { getClientForSession } from "../telegram/clientManager";
import { logger } from "../lib/logger";
import { randomUUID } from "node:crypto";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION_COOKIE = "tg_session_id";
const IMPERSONATE_COOKIE = "tg_impersonate";
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

function parseCookieValue(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const pair of header.split(";")) {
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    if (pair.slice(0, idx).trim() === name) {
      const val = pair.slice(idx + 1).trim();
      return UUID_RE.test(val) ? val : null;
    }
  }
  return null;
}

export async function sessionMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const cookieHeader = req.headers.cookie;

  // 1. Impersonation cookie takes highest priority (set server-side by /admin/impersonate)
  const impersonated = parseCookieValue(cookieHeader, IMPERSONATE_COOKIE);

  // 2. Explicit X-Session-ID header (sent by new frontend JS)
  const headerVal = req.headers["x-session-id"];
  const headerId =
    typeof headerVal === "string" && UUID_RE.test(headerVal.trim())
      ? headerVal.trim()
      : null;

  // 3. Regular session cookie fallback
  const cookieId = parseCookieValue(cookieHeader, SESSION_COOKIE);

  // 4. Generate brand-new session if nothing provided
  const sessionId = impersonated ?? headerId ?? cookieId ?? (() => {
    const id = randomUUID();
    logger.info({ sessionId: id }, "New session generated server-side");
    return id;
  })();

  // Refresh the session cookie (not the impersonation cookie — that is managed by /admin routes)
  if (!impersonated) {
    res.setHeader(
      "Set-Cookie",
      `${SESSION_COOKIE}=${sessionId}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax`,
    );
  }

  req.sessionId = sessionId;
  try {
    req.telegramClient = await getClientForSession(sessionId);
  } catch (err) {
    logger.warn({ err, sessionId }, "Failed to initialise client for session");
  }

  next();
}
