import { Router, type IRouter, type Request, type Response } from "express";
import {
  isSessionAuthenticated,
  startSessionLogin,
  completeSessionLogin,
  logoutSession,
  registerHandlersForSession,
  startQrLogin,
  cancelQrLogin,
  submitQrPassword,
  getQrEmitter,
  getLastQrEvent,
  type QrEvent,
} from "../telegram/clientManager";
import { getMe } from "../telegram/chats";
import { isImpersonating } from "../telegram/impersonationStore";

const router: IRouter = Router();

function handleAuthError(req: Request, res: Response, err: unknown, fallback: string): void {
  const message = err instanceof Error ? err.message : String(err);
  req.log.error({ err }, fallback);
  if (/PHONE_NUMBER_INVALID/i.test(message)) {
    res.status(400).json({ error: "Invalid phone number", detail: message });
    return;
  }
  if (/PHONE_CODE_INVALID|PHONE_CODE_EXPIRED|PHONE_CODE_EMPTY/i.test(message)) {
    res.status(400).json({ error: "Invalid or expired code", detail: message });
    return;
  }
  if (/PASSWORD_HASH_INVALID/i.test(message)) {
    res.status(400).json({ error: "Wrong 2FA password", detail: message });
    return;
  }
  if (/FLOOD_WAIT/i.test(message)) {
    res.status(429).json({ error: "Too many attempts, please wait", detail: message });
    return;
  }
  res.status(500).json({ error: fallback, detail: message });
}

router.get("/auth/status", async (req: Request, res: Response) => {
  const sessionId = req.sessionId;
  if (!sessionId) {
    res.json({ authenticated: false });
    return;
  }
  try {
    const authed = await isSessionAuthenticated(sessionId);
    if (!authed) {
      res.json({ authenticated: false });
      return;
    }
    const client = req.telegramClient;
    if (!client) {
      res.json({ authenticated: false });
      return;
    }
    const me = await getMe(client);
    const callerSessionId = req.callerSessionId ?? req.sessionId ?? "";
    res.json({ authenticated: true, me, impersonating: isImpersonating(callerSessionId) });
  } catch (err) {
    req.log.warn({ err }, "auth/status failed");
    res.json({ authenticated: false });
  }
});

router.post("/auth/send-code", async (req: Request, res: Response) => {
  const sessionId = req.sessionId!;
  const body = (req.body ?? {}) as { phone?: string };
  const phone = body.phone?.trim();
  if (!phone) {
    res.status(400).json({ error: "phone is required" });
    return;
  }
  try {
    const result = await startSessionLogin(sessionId, phone);
    res.json(result);
  } catch (err) {
    handleAuthError(req, res, err, "Failed to send login code");
  }
});

router.post("/auth/sign-in", async (req: Request, res: Response) => {
  const sessionId = req.sessionId!;
  const body = (req.body ?? {}) as {
    phone?: string;
    phoneCodeHash?: string;
    code?: string;
    password?: string;
  };
  const { phone, phoneCodeHash, code, password } = body;
  if (!phone || !phoneCodeHash || !code) {
    res.status(400).json({ error: "phone, phoneCodeHash, and code are required" });
    return;
  }
  try {
    const result = await completeSessionLogin(sessionId, { phone, phoneCodeHash, code, password });
    if ("needsPassword" in result) {
      res.json({ ok: false, needsPassword: true });
      return;
    }
    // Register update handlers now that the client is authenticated.
    // The client was built without handlers since it had no session string yet.
    void registerHandlersForSession(sessionId);
    res.json({ ok: true });
  } catch (err) {
    handleAuthError(req, res, err, "Failed to sign in");
  }
});

// ---------------------------------------------------------------------------
// QR code login endpoints
// ---------------------------------------------------------------------------

const QR_PING_INTERVAL_MS = 25_000;

router.post("/auth/qr/start", async (req: Request, res: Response) => {
  const sessionId = req.sessionId!;
  try {
    await startQrLogin(sessionId);
    res.json({ ok: true });
  } catch (err) {
    handleAuthError(req, res, err, "Failed to start QR login");
  }
});

router.get("/auth/qr/events", (req: Request, res: Response) => {
  const sessionId = req.sessionId;
  if (!sessionId) {
    res.status(401).json({ error: "No session" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  function send(event: QrEvent) {
    if (res.destroyed) return;
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch { /* ignore */ }
  }

  const emitterOrNull = getQrEmitter(sessionId);
  if (!emitterOrNull) {
    send({ type: "error", message: "No active QR session. Call /auth/qr/start first." });
    res.end();
    return;
  }

  const emitter = emitterOrNull;

  // Replay the last QR token immediately so the client doesn't have to wait
  // for the next gramJS refresh cycle if it connected after the first token.
  const lastQr = getLastQrEvent(sessionId);
  if (lastQr) send(lastQr);

  function onQrEvent(event: QrEvent) {
    send(event);
    if (event.type === "success" || event.type === "error") {
      cleanup();
      res.end();
    }
  }

  emitter.on("qr-event", onQrEvent);

  const heartbeat = setInterval(() => {
    if (res.destroyed) { clearInterval(heartbeat); return; }
    try { res.write(": ping\n\n"); } catch { /* ignore */ }
  }, QR_PING_INTERVAL_MS);

  function cleanup() {
    clearInterval(heartbeat);
    emitter.off("qr-event", onQrEvent);
  }

  req.on("close", cleanup);
});

router.post("/auth/qr/password", (req: Request, res: Response) => {
  const sessionId = req.sessionId!;
  const body = (req.body ?? {}) as { password?: string };
  const password = body.password;
  if (!password) {
    res.status(400).json({ error: "password is required" });
    return;
  }
  const ok = submitQrPassword(sessionId, password);
  if (!ok) {
    res.status(400).json({ error: "No QR session waiting for a password" });
    return;
  }
  res.json({ ok: true });
});

router.post("/auth/qr/cancel", (req: Request, res: Response) => {
  const sessionId = req.sessionId!;
  cancelQrLogin(sessionId);
  res.json({ ok: true });
});

router.post("/auth/logout", async (req: Request, res: Response) => {
  const sessionId = req.sessionId;
  if (!sessionId) {
    res.json({ ok: true });
    return;
  }
  try {
    await logoutSession(sessionId);
    res.json({ ok: true });
  } catch (err) {
    handleAuthError(req, res, err, "Failed to log out");
  }
});

export default router;
