import { type Request, type Response, type NextFunction } from "express";
import { getClientForSession } from "../telegram/clientManager";
import { logger } from "../lib/logger";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function sessionMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const raw = req.headers["x-session-id"];
  const sessionId = typeof raw === "string" ? raw.trim() : undefined;

  if (sessionId && UUID_RE.test(sessionId)) {
    req.sessionId = sessionId;
    try {
      req.telegramClient = await getClientForSession(sessionId);
    } catch (err) {
      logger.warn({ err, sessionId }, "Failed to initialise client for session");
    }
  }

  next();
}
