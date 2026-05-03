import { Router, type IRouter, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { getAllSessions } from "../telegram/sessionStore";
import {
  startImpersonation,
  stopImpersonation,
  getImpersonationTarget,
} from "../telegram/impersonationStore";

const router: IRouter = Router();

const ADMIN_SECRET = process.env["ADMIN_SECRET"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function checkAdmin(req: Request, res: Response): boolean {
  if (!ADMIN_SECRET) {
    res.status(503).json({ error: "Admin not configured. Set the ADMIN_SECRET environment variable." });
    return false;
  }
  const provided = req.headers["x-admin-secret"];
  if (typeof provided !== "string" || provided !== ADMIN_SECRET) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

// Rate limit: max 10 verify attempts per IP per 60 seconds
const verifyRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many verification attempts, please try again later." },
  skipSuccessfulRequests: false,
});

router.post("/admin/verify", verifyRateLimiter, (req: Request, res: Response) => {
  if (!checkAdmin(req, res)) return;
  res.json({ ok: true });
});

router.get("/admin/sessions", async (req: Request, res: Response) => {
  if (!checkAdmin(req, res)) return;

  const map = await getAllSessions();
  const sessions = Object.entries(map)
    .filter(([, r]) => !!r.sessionString)
    .sort((a, b) => b[1].lastSeen - a[1].lastSeen)
    .map(([sessionId, r]) => ({
      sessionId,
      phone: r.phone ?? null,
      userId: r.userId ?? null,
      firstName: r.firstName ?? null,
      username: r.username ?? null,
      lastSeen: r.lastSeen,
    }));

  res.json({ sessions });
});

// Start impersonating: stores adminSession → targetSession in memory.
// The session middleware will transparently use the target's TelegramClient
// for all subsequent requests from this admin session.
router.post("/admin/impersonate", async (req: Request, res: Response) => {
  if (!checkAdmin(req, res)) return;

  const callerSessionId = req.callerSessionId ?? req.sessionId;
  if (!callerSessionId) {
    res.status(400).json({ error: "No session ID found for this request" });
    return;
  }

  const body = (req.body ?? {}) as { targetSessionId?: string };
  const { targetSessionId } = body;

  if (!targetSessionId || !UUID_RE.test(targetSessionId)) {
    res.status(400).json({ error: "Valid targetSessionId required" });
    return;
  }

  const sessions = await getAllSessions();
  if (!sessions[targetSessionId]) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  startImpersonation(callerSessionId, targetSessionId);
  res.json({ ok: true, callerSessionId, targetSessionId });
});

// Stop impersonating: removes the mapping so this admin session uses its own data again.
router.post("/admin/stop-impersonate", (req: Request, res: Response) => {
  if (!checkAdmin(req, res)) return;

  const callerSessionId = req.callerSessionId ?? req.sessionId;
  if (callerSessionId) {
    stopImpersonation(callerSessionId);
  }
  res.json({ ok: true });
});

// Returns whether the caller's session is currently impersonating someone.
router.get("/admin/impersonate-status", (req: Request, res: Response) => {
  if (!checkAdmin(req, res)) return;

  const callerSessionId = req.callerSessionId ?? req.sessionId;
  const target = callerSessionId ? getImpersonationTarget(callerSessionId) : null;
  res.json({ impersonating: target, ownSession: callerSessionId ?? null });
});

export default router;
