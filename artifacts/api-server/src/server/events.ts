import { Router, type IRouter, type Request, type Response } from "express";
import { NewMessage } from "telegram/events/index.js";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * GET /api/events
 *
 * Server-Sent Events stream. The client connects once per page load; the
 * server pushes a "update" event whenever gramjs fires a NewMessage event on
 * the authenticated session's client. Clients use this to invalidate their
 * dialog/message caches instead of relying on aggressive polling.
 */
router.get("/events", async (req: Request, res: Response) => {
  const client = req.telegramClient;
  if (!client) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  // Require an active, authorized Telegram session — not just an attached client.
  try {
    const authed = await client.isUserAuthorized();
    if (!authed) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
  } catch {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  function send(eventName: string, data: unknown) {
    try {
      res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      // client disconnected
    }
  }

  // Send an initial heartbeat so the browser knows the stream is alive
  send("connected", { ok: true });

  // Keep-alive ping every 20 s to prevent proxy timeouts
  const heartbeat = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { clearInterval(heartbeat); }
  }, 20_000);

  // Listen for new messages via gramjs event system
  function onNewMessage() {
    send("update", { type: "new_message" });
  }

  const handler = new NewMessage({});
  handler.resolve = handler.resolve?.bind(handler);

  try {
    client.addEventHandler(onNewMessage, handler);
  } catch (err) {
    logger.warn({ err }, "SSE: failed to attach NewMessage handler");
  }

  // Clean up when client disconnects
  req.on("close", () => {
    clearInterval(heartbeat);
    try {
      client.removeEventHandler(onNewMessage, handler);
    } catch { /* ignore */ }
    logger.debug({ sessionId: req.sessionId }, "SSE client disconnected");
  });
});

export default router;
