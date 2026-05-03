import { Router, type IRouter, type Request, type Response } from "express";
import { getAllSessions } from "../telegram/sessionStore";

const router: IRouter = Router();

const ADMIN_SECRET = process.env["ADMIN_SECRET"];

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

export default router;
