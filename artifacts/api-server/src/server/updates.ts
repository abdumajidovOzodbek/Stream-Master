/**
 * GET /api/updates — Server-Sent Events stream.
 *
 * One long-lived connection per browser tab. The client receives real-time
 * updates (new messages, edits, deletions, typing, read receipts, presence)
 * pushed from the Telegram MTProto connection without polling.
 *
 * Auth: session cookie or ?sid= query param (EventSource cannot set headers).
 * Keepalive: a `ping` event is sent every 25 s to prevent proxy timeouts.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { getOrCreateBus } from "../telegram/updateBus";
import { isSessionAuthenticated } from "../telegram/clientManager";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const PING_INTERVAL_MS = 25_000;

router.get("/updates", async (req: Request, res: Response) => {
  const sessionId = req.sessionId;
  if (!sessionId) {
    res.status(401).json({ error: "No session" });
    return;
  }

  // Require authentication — unauthenticated sessions shouldn't hold SSE connections
  const authed = await isSessionAuthenticated(sessionId).catch(() => false);
  if (!authed) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  // ── Set SSE response headers ──────────────────────────────────────────
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // Disable nginx proxy buffering so events reach the client immediately
  res.setHeader("X-Accel-Buffering", "no");
  // Allow cross-origin if needed
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  // Confirm connection
  res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

  logger.debug({ sessionId }, "SSE client connected");

  // ── Subscribe to the session's event bus ────────────────────────────
  const bus = getOrCreateBus(sessionId);

  function send(event: unknown) {
    if (res.destroyed) return;
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch (err) {
      logger.warn({ err, sessionId }, "Failed to write SSE event");
    }
  }

  bus.on("update", send);

  // ── Heartbeat ────────────────────────────────────────────────────────
  const heartbeat = setInterval(() => {
    if (res.destroyed) { clearInterval(heartbeat); return; }
    send({ type: "ping" });
  }, PING_INTERVAL_MS);

  // ── Cleanup on disconnect ────────────────────────────────────────────
  req.on("close", () => {
    clearInterval(heartbeat);
    bus.off("update", send);
    logger.debug({ sessionId }, "SSE client disconnected");
  });
});

export default router;
