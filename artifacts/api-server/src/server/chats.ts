import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import {
  getMe,
  listDialogs,
  listMessages,
  searchMessages,
  searchContacts,
  fetchOgData,
  getDialogFolders,
  getUserInfo,
  getProfilePhoto,
  openMessageMedia,
  sendChatMessage,
  sendMediaFile,
  markChatRead,
  setMessageReaction,
} from "../telegram/chats";
import { streamRangedResponse } from "../lib/range";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function handleError(req: Request, res: Response, err: unknown, fallback: string): void {
  const message = err instanceof Error ? err.message : String(err);
  req.log.error({ err }, fallback);
  if (/TELEGRAM_SESSION|NOT_LOGGED_IN|AUTH_KEY_UNREGISTERED|SESSION_REVOKED/i.test(message)) {
    res.status(401).json({ error: "Not logged in", detail: message });
    return;
  }
  if (/CHANNEL_PRIVATE|CHAT_ADMIN_REQUIRED|USERNAME_INVALID|USERNAME_NOT_OCCUPIED|PEER_ID_INVALID/i.test(message)) {
    res.status(403).json({ error: "Inaccessible", detail: message });
    return;
  }
  res.status(500).json({ error: fallback, detail: message });
}

// ---------------------------------------------------------------------------
// Me + dialogs
// ---------------------------------------------------------------------------

router.get("/me", async (req: Request, res: Response) => {
  try {
    res.json(await getMe());
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

router.get("/contacts/search", async (req: Request, res: Response) => {
  const q = ((req.query["q"] as string | undefined) ?? "").trim();
  if (!q) { res.status(400).json({ error: "Missing query param: q" }); return; }
  const limit = Math.min(Number(req.query["limit"] ?? 20) || 20, 50);
  try {
    res.json(await searchContacts(q, limit));
  } catch (err) {
    handleError(req, res, err, "Failed to search contacts");
  }
});

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

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
    res.json(await listMessages(chatId, limit, offsetId));
  } catch (err) {
    handleError(req, res, err, "Failed to fetch messages");
  }
});

router.get("/search", async (req: Request, res: Response) => {
  const chatId = (req.query["chatId"] as string | undefined)?.trim();
  const q = (req.query["q"] as string | undefined)?.trim();
  if (!chatId || !q) {
    res.status(400).json({ error: "Missing required query params: chatId, q" });
    return;
  }
  const limit = Math.min(Number(req.query["limit"] ?? 20) || 20, 50);
  try {
    res.json(await searchMessages(chatId, q, limit));
  } catch (err) {
    handleError(req, res, err, "Failed to search messages");
  }
});

router.post("/messages", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as {
    chatId?: string;
    text?: string;
    replyToMsgId?: number;
    scheduleDate?: number;
  };
  const chatId = body.chatId?.trim();
  const text = body.text;
  if (!chatId || !text || !text.trim()) {
    res.status(400).json({ error: "chatId and text are required" });
    return;
  }
  try {
    res.json(await sendChatMessage(chatId, text, body.replyToMsgId, body.scheduleDate));
  } catch (err) {
    handleError(req, res, err, "Failed to send message");
  }
});

router.get("/og", async (req: Request, res: Response) => {
  const url = ((req.query["url"] as string | undefined) ?? "").trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    res.status(400).json({ error: "Missing or invalid url" });
    return;
  }
  try {
    res.json(await fetchOgData(url));
  } catch (err) {
    handleError(req, res, err, "Failed to fetch OG data");
  }
});

router.get("/folders", async (req: Request, res: Response) => {
  try {
    res.json(await getDialogFolders());
  } catch (err) {
    handleError(req, res, err, "Failed to fetch folders");
  }
});

// ---------------------------------------------------------------------------
// Media upload (send file)
// ---------------------------------------------------------------------------

router.post(
  "/media",
  upload.single("file"),
  async (req: Request, res: Response) => {
    const file = req.file;
    const body = (req.body ?? {}) as { chatId?: string; caption?: string; replyToMsgId?: string };
    const chatId = body.chatId?.trim();
    if (!file || !chatId) {
      res.status(400).json({ error: "file and chatId are required" });
      return;
    }
    const caption = body.caption?.trim();
    const replyToMsgId = Number(body.replyToMsgId) || undefined;
    try {
      res.json(
        await sendMediaFile(chatId, file.buffer, file.originalname, caption, replyToMsgId),
      );
    } catch (err) {
      handleError(req, res, err, "Failed to send media");
    }
  },
);

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

router.post("/reactions/:chatId/:msgId", async (req: Request, res: Response) => {
  const chatRaw = req.params["chatId"];
  const msgRaw = req.params["msgId"];
  const chatId = (Array.isArray(chatRaw) ? chatRaw[0] : chatRaw) ?? "";
  const msgId = Number((Array.isArray(msgRaw) ? msgRaw[0] : msgRaw) ?? "");
  if (!chatId || !Number.isFinite(msgId)) {
    res.status(400).json({ error: "Invalid chatId or msgId" });
    return;
  }
  const body = (req.body ?? {}) as { emoji?: string | null };
  const emoji = typeof body.emoji === "string" ? body.emoji : null;
  try {
    res.json(await setMessageReaction(chatId, msgId, emoji));
  } catch (err) {
    handleError(req, res, err, "Failed to set reaction");
  }
});

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

router.post("/dialogs/:chatId/read", async (req: Request, res: Response) => {
  const raw = req.params["chatId"];
  const chatId = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  if (!chatId) {
    res.status(400).json({ error: "Missing chatId" });
    return;
  }
  const body = (req.body ?? {}) as { maxId?: number };
  const maxId =
    typeof body.maxId === "number" && Number.isFinite(body.maxId)
      ? body.maxId
      : undefined;
  try {
    res.json(await markChatRead(chatId, maxId));
  } catch (err) {
    handleError(req, res, err, "Failed to mark chat as read");
  }
});

// ---------------------------------------------------------------------------
// User info
// ---------------------------------------------------------------------------

router.get("/users/:peerId", async (req: Request, res: Response) => {
  const raw = req.params["peerId"];
  const peerId = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  if (!peerId) {
    res.status(400).json({ error: "Missing peerId" });
    return;
  }
  try {
    res.json(await getUserInfo(peerId));
  } catch (err) {
    handleError(req, res, err, "Failed to fetch user info");
  }
});

// ---------------------------------------------------------------------------
// Photo + media
// ---------------------------------------------------------------------------

router.get("/photo/:peerId", async (req: Request, res: Response) => {
  const raw = req.params["peerId"];
  const peerId = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  if (!peerId) {
    res.status(400).json({ error: "Missing peerId" });
    return;
  }
  try {
    const result = await getProfilePhoto(peerId);
    if (!result) {
      res.status(404).json({ error: "No profile photo" });
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Content-Type", result.mimeType);
    res.setHeader("Content-Length", String(result.buffer.length));
    res.end(result.buffer);
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
  const forceDownload = req.query["download"] === "1";
  if (!chatId || !Number.isFinite(msgId)) {
    res.status(400).json({ error: "Invalid chatId or msgId" });
    return;
  }
  try {
    const opened = await openMessageMedia(chatId, msgId, thumb);
    if (!opened) {
      res.status(404).json({ error: "Media not found" });
      return;
    }
    res.setHeader("Cache-Control", "private, max-age=300");

    if (opened.fullBuffer) {
      if (opened.info.mimeType) res.setHeader("Content-Type", opened.info.mimeType);
      res.setHeader("Content-Length", String(opened.info.size));
      if (forceDownload) {
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${encodeURIComponent(opened.info.fileName)}"`,
        );
      }
      res.end(opened.fullBuffer);
      return;
    }

    if (opened.streamRange) {
      await streamRangedResponse(req, res, {
        totalSize: opened.info.size,
        mimeType: opened.info.mimeType,
        fileName: opened.info.fileName,
        forceDownload,
        stream: opened.streamRange,
      });
      return;
    }

    res.status(500).json({ error: "Media not streamable" });
  } catch (err) {
    handleError(req, res, err, "Failed to fetch media");
  }
});

export default router;
