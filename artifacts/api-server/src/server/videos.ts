import { Router, type IRouter, type Request, type Response } from "express";
import { listChannelVideos, streamChannelVideo } from "../telegram/videos";

const router: IRouter = Router();

router.get("/channel-videos", async (req: Request, res: Response) => {
  const channel = (req.query["channel"] as string | undefined)?.trim();
  if (!channel) {
    res.status(400).json({ error: "Missing required query param: channel" });
    return;
  }

  const limit = Math.min(Number(req.query["limit"] ?? 20) || 20, 100);

  const protoHeader = req.headers["x-forwarded-proto"];
  const proto = (Array.isArray(protoHeader) ? protoHeader[0] : protoHeader) || req.protocol;
  const hostHeader = req.headers["x-forwarded-host"] ?? req.headers.host;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  const baseUrl = `${proto}://${host}`;

  try {
    const metas = await listChannelVideos(channel, limit);
    const channelHandle = channel.replace(/^@/, "");
    const videos = metas.map((meta) => ({
      ...meta,
      telegramUrl: `https://t.me/${channelHandle}/${meta.messageId}`,
      url: `${baseUrl}/api/videos/${encodeURIComponent(channel)}/${meta.messageId}`,
      downloaded: false,
    }));
    res.json({ channel, count: videos.length, videos });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    req.log.error({ err, channel }, "Failed to fetch channel videos");

    if (/CHANNEL_PRIVATE|CHAT_ADMIN_REQUIRED|USERNAME_INVALID|USERNAME_NOT_OCCUPIED/i.test(message)) {
      res.status(403).json({ error: "Channel is private or inaccessible", detail: message });
      return;
    }
    if (/TELEGRAM_SESSION/i.test(message)) {
      res.status(401).json({ error: "Not logged in", detail: message });
      return;
    }
    res.status(500).json({ error: "Failed to fetch channel videos", detail: message });
  }
});

router.get("/videos/:channel/:messageId", async (req: Request, res: Response) => {
  const channelRaw = req.params["channel"];
  const msgRaw = req.params["messageId"];
  const channel = (Array.isArray(channelRaw) ? channelRaw[0] : channelRaw) ?? "";
  const messageId = Number((Array.isArray(msgRaw) ? msgRaw[0] : msgRaw) ?? "");
  const forceDownload = req.query["download"] === "1" || req.query["download"] === "true";

  if (!channel || !Number.isFinite(messageId)) {
    res.status(400).json({ error: "Invalid channel or messageId" });
    return;
  }

  try {
    const result = await streamChannelVideo(channel, messageId);
    if (!result) {
      res.status(404).json({ error: "Video not found" });
      return;
    }
    if (result.mimeType) res.setHeader("Content-Type", result.mimeType);
    res.setHeader("Content-Length", String(result.buffer.length));
    res.setHeader("Cache-Control", "private, max-age=300");
    if (forceDownload) {
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(result.fileName)}"`,
      );
    }
    res.end(result.buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    req.log.error({ err, channel, messageId }, "Failed to stream video");
    if (/TELEGRAM_SESSION|AUTH_KEY_UNREGISTERED/i.test(message)) {
      res.status(401).json({ error: "Not logged in", detail: message });
      return;
    }
    res.status(500).json({ error: "Failed to stream video", detail: message });
  }
});

export default router;
