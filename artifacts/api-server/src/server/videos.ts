import { Router, type IRouter, type Request, type Response } from "express";
import express from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import { STORAGE_DIR, fetchAndPrepareChannelVideos } from "../telegram/videos";

const router: IRouter = Router();

router.use("/videos", express.static(STORAGE_DIR, { fallthrough: true }));

router.get("/videos/:filename", (req: Request, res: Response) => {
  const raw = req.params["filename"];
  const filename = path.basename(Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? ""));
  const filePath = path.join(STORAGE_DIR, filename);
  if (!existsSync(filePath)) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  res.sendFile(filePath);
});

router.get("/channel-videos", async (req: Request, res: Response) => {
  const channel = (req.query["channel"] as string | undefined)?.trim();
  if (!channel) {
    res.status(400).json({ error: "Missing required query param: channel" });
    return;
  }

  const limit = Math.min(Number(req.query["limit"] ?? 20) || 20, 100);
  const download = req.query["download"] === "true";

  const protoHeader = req.headers["x-forwarded-proto"];
  const proto = (Array.isArray(protoHeader) ? protoHeader[0] : protoHeader) || req.protocol;
  const hostHeader = req.headers["x-forwarded-host"] ?? req.headers.host;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  const baseUrl = `${proto}://${host}`;

  try {
    const videos = await fetchAndPrepareChannelVideos(
      channel,
      baseUrl,
      limit,
      download,
    );
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

export default router;
