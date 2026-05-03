import { Router, type IRouter, type Request, type Response } from "express";
import { type TelegramClient } from "telegram";
import { getChatStats } from "../telegram/stats";

const router: IRouter = Router();

async function getAuthedClient(req: Request, res: Response): Promise<TelegramClient | null> {
  const client = req.telegramClient;
  if (!client) {
    res.status(401).json({ error: "Not logged in", detail: "No session ID" });
    return null;
  }
  const authed = await client.isUserAuthorized().catch(() => false);
  if (!authed) {
    res.status(401).json({ error: "Not logged in" });
    return null;
  }
  return client;
}

router.get("/stats/:chatId", async (req: Request, res: Response) => {
  const client = await getAuthedClient(req, res);
  if (!client) return;

  const { chatId } = req.params as { chatId: string };
  const limit = Math.min(Math.max(Number(req.query["limit"] ?? 500) || 500, 50), 1000);

  try {
    const stats = await getChatStats(client, chatId, limit);
    res.json(stats);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "Failed to compute chat stats");
    res.status(500).json({ error: "Failed to compute chat stats", detail: message });
  }
});

export default router;
