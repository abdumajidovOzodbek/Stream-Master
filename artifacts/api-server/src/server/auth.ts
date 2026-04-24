import { Router, type IRouter, type Request, type Response } from "express";
import {
  isAuthenticated,
  startLogin,
  completeLogin,
  logout,
} from "../telegram/client";
import { getMe } from "../telegram/chats";

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
  try {
    const authed = await isAuthenticated();
    if (!authed) {
      res.json({ authenticated: false });
      return;
    }
    const me = await getMe();
    res.json({ authenticated: true, me });
  } catch (err) {
    req.log.warn({ err }, "auth/status failed");
    res.json({ authenticated: false });
  }
});

router.post("/auth/send-code", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { phone?: string };
  const phone = body.phone?.trim();
  if (!phone) {
    res.status(400).json({ error: "phone is required" });
    return;
  }
  try {
    const result = await startLogin(phone);
    res.json(result);
  } catch (err) {
    handleAuthError(req, res, err, "Failed to send login code");
  }
});

router.post("/auth/sign-in", async (req: Request, res: Response) => {
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
    const result = await completeLogin({ phone, phoneCodeHash, code, password });
    if ("needsPassword" in result) {
      res.json({ ok: false, needsPassword: true });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    handleAuthError(req, res, err, "Failed to sign in");
  }
});

router.post("/auth/logout", async (req: Request, res: Response) => {
  try {
    await logout();
    res.json({ ok: true });
  } catch (err) {
    handleAuthError(req, res, err, "Failed to log out");
  }
});

export default router;
