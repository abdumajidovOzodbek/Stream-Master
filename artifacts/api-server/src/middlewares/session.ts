import { type Request, type Response, type NextFunction } from "express";
import { getClientForSession } from "../telegram/clientManager";
import { getImpersonationTarget } from "../telegram/impersonationStore";
import { logger } from "../lib/logger";
import { randomUUID } from "node:crypto";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION_COOKIE = "tg_session_id";
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

  // 1. Explicit X-Session-ID header (sent by frontend JS)
  const headerVal = req.headers["x-session-id"];
  const headerId =
    typeof headerVal === "string" && UUID_RE.test(headerVal.trim())
      ? headerVal.trim()
      : null;

  // 2. Regular session cookie fallback
  const cookieId = parseCookieValue(cookieHeader, SESSION_COOKIE);

  // 3. Generate brand-new session if nothing provided
  let callerSessionId = headerId ?? cookieId ?? (() => {
    const id = randomUUID();
    logger.info({ sessionId: id }, "New session generated server-side");
    return id;
  })();

  // Keep the session cookie fresh
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${callerSessionId}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax`,
  );

  // 4. Check if this caller is impersonating someone — use target session instead
  const impersonationTarget = getImpersonationTarget(callerSessionId);
  const sessionId = impersonationTarget ?? callerSessionId;

  if (impersonationTarget) {
    logger.debug({ callerSessionId, impersonationTarget }, "Serving impersonated session");
  }

  req.sessionId = sessionId;
  req.callerSessionId = callerSessionId; // Admin endpoints need the real caller ID
  try {
    req.telegramClient = await getClientForSession(sessionId);
  } catch (err) {
    logger.warn({ err, sessionId }, "Failed to initialise client for session");
  }

  next();
}
