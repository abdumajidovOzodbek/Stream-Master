import { type Request, type Response, type NextFunction } from "express";
import { getClientForSession } from "../telegram/clientManager";
import { logger } from "../lib/logger";
import { randomUUID } from "node:crypto";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COOKIE_NAME = "tg_session_id";
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year in seconds

function parseCookie(header: string | undefined): string | null {
  if (!header) return null;
  for (const pair of header.split(";")) {
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    if (pair.slice(0, idx).trim() === COOKIE_NAME) {
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
  // 1. Prefer the explicit header (sent by new frontend JS)
  const headerVal = req.headers["x-session-id"];
  let sessionId: string | null =
    typeof headerVal === "string" && UUID_RE.test(headerVal.trim())
      ? headerVal.trim()
      : null;

  // 2. Fall back to cookie (works for old JS, mobile browsers, etc.)
  if (!sessionId) {
    sessionId = parseCookie(req.headers.cookie);
  }

  // 3. Generate a brand-new session if neither was provided
  if (!sessionId) {
    sessionId = randomUUID();
    logger.info({ sessionId }, "New session generated server-side");
  }

  // Always keep the cookie fresh / set it for first-time visitors
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${sessionId}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax`,
  );

  req.sessionId = sessionId;
  try {
    req.telegramClient = await getClientForSession(sessionId);
  } catch (err) {
    logger.warn({ err, sessionId }, "Failed to initialise client for session");
  }

  next();
}
