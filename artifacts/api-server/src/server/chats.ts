import { Router, type IRouter, type Request, type Response } from "express";
import { existsSync } from "node:fs";
import {
  getMe,
  listDialogs,
  listMessages,
  getProfilePhoto,
  getMessageMedia,
} from "../telegram/chats";

const router: IRouter = Router();

function baseUrlFromReq(req: Request): string {
  const protoHeader = req.headers["x-forwarded-proto"];
  const proto =
    (Array.isArray(protoHeader) ? protoHeader[0] : protoHeader) || req.protocol;
  const hostHeader = req.headers["x-forwarded-host"] ?? req.headers.host;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  return `${proto}://${host}`;
}

function handleError(req: Request, res: Response, err: unknown, fallback: string): void {
  const message = err instanceof Error ? err.message : String(err);
  req.log.error({ err }, fallback);
  if (/TELEGRAM_SESSION/i.test(message)) {
    res.status(401).json({ error: "Not logged in", detail: message });
    return;
  }
  if (/CHANNEL_PRIVATE|CHAT_ADMIN_REQUIRED|USERNAME_INVALID|USERNAME_NOT_OCCUPIED|PEER_ID_INVALID/i.test(message)) {
    res.status(403).json({ error: "Inaccessible", detail: message });
    return;
  }
  res.status(500).json({ error: fallback, detail: message });
}

router.get("/me", async (req: Request, res: Response) => {
  try {
    const me = await getMe();
    res.json(me);
  } catch (err) {
    handleError(req, res, err, "Failed to fetch user info");
  }
});

router.get("/dialogs", async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query["limit"] ?? 100) || 100, 300);
  try {
    const dialogs = await listDialogs(limit);
    res.json({ count: dialogs.length, dialogs });
  } catch (err) {
    handleError(req, res, err, "Failed to fetch dialogs");
  }
});

router.get("/messages", async (req: Request, res: Response) => {
  const chatId = (req.query["chatId"] as string | undefined)?.trim();
  if (!chatId) {
    res.status(400).json({ error: "Missing required query param: chatId" });
    return;
  }
  const limit = Math.min(Number(req.query["limit"] ?? 50) || 50, 100);
  const offsetIdRaw = req.query["offsetId"];
  const offsetId = offsetIdRaw ? Number(offsetIdRaw) : undefined;

  try {
    const result = await listMessages(chatId, limit, offsetId, baseUrlFromReq(req));
    res.json(result);
  } catch (err) {
    handleError(req, res, err, "Failed to fetch messages");
  }
});

router.get("/photo/:peerId", async (req: Request, res: Response) => {
  const raw = req.params["peerId"];
  const peerId = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  if (!peerId) {
    res.status(400).json({ error: "Missing peerId" });
    return;
  }
  try {
    const result = await getProfilePhoto(peerId);
    if (!result || !existsSync(result.filePath)) {
      res.status(404).json({ error: "No profile photo" });
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.sendFile(result.filePath);
  } catch (err) {
    handleError(req, res, err, "Failed to fetch profile photo");
  }
});

router.get("/media/:chatId/:msgId", async (req: Request, res: Response) => {
  const chatRaw = req.params["chatId"];
  const msgRaw = req.params["msgId"];
  const chatId = (Array.isArray(chatRaw) ? chatRaw[0] : chatRaw) ?? "";
  const msgId = Number((Array.isArray(msgRaw) ? msgRaw[0] : msgRaw) ?? "");
  const thumb = req.query["thumb"] === "1";
  if (!chatId || !Number.isFinite(msgId)) {
    res.status(400).json({ error: "Invalid chatId or msgId" });
    return;
  }
  try {
    const result = await getMessageMedia(chatId, msgId, thumb);
    if (!result) {
      res.status(404).json({ error: "Media not found" });
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=86400");
    if (result.mimeType) res.setHeader("Content-Type", result.mimeType);
    res.sendFile(result.filePath);
  } catch (err) {
    handleError(req, res, err, "Failed to fetch media");
  }
});

export default router;
