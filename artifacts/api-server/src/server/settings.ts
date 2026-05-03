import { Router, type IRouter, type Request, type Response } from "express";
import { type TelegramClient } from "telegram";
import multer from "multer";
import {
  getProfile,
  updateProfile,
  updateUsername,
  uploadProfilePhoto,
  getPrivacy,
  setPrivacy,
  getSessions,
  terminateSession,
  terminateAllOtherSessions,
  getBlocked,
  unblockUser,
  get2FAStatus,
  type PrivacyValue,
} from "../telegram/settings";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function handleError(req: Request, res: Response, err: unknown, fallback: string): void {
  const message = err instanceof Error ? err.message : String(err);
  req.log.error({ err }, fallback);
  if (/USERNAME_NOT_MODIFIED|USERNAME_INVALID|USERNAME_OCCUPIED/i.test(message)) {
    res.status(400).json({ error: message });
    return;
  }
  res.status(500).json({ error: fallback, detail: message });
}

async function getAuthedClient(req: Request, res: Response): Promise<TelegramClient | null> {
  const client = req.telegramClient;
  if (!client) {
    res.status(401).json({ error: "Not logged in" });
    return null;
  }
  const authed = await client.isUserAuthorized().catch(() => false);
  if (!authed) {
    res.status(401).json({ error: "Not logged in" });
    return null;
  }
  return client;
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

router.get("/settings/profile", async (req: Request, res: Response) => {
  const client = await getAuthedClient(req, res);
  if (!client) return;
  try {
    res.json(await getProfile(client));
  } catch (err) {
    handleError(req, res, err, "Failed to get profile");
  }
});

router.post("/settings/profile", async (req: Request, res: Response) => {
  const client = await getAuthedClient(req, res);
  if (!client) return;
  const { firstName, lastName, bio } = (req.body ?? {}) as {
    firstName?: string;
    lastName?: string;
    bio?: string;
  };
  try {
    res.json(await updateProfile(client, { firstName, lastName, bio }));
  } catch (err) {
    handleError(req, res, err, "Failed to update profile");
  }
});

router.post("/settings/profile/username", async (req: Request, res: Response) => {
  const client = await getAuthedClient(req, res);
  if (!client) return;
  const { username } = (req.body ?? {}) as { username?: string };
  if (username === undefined) {
    res.status(400).json({ error: "username is required" });
    return;
  }
  try {
    res.json(await updateUsername(client, username));
  } catch (err) {
    handleError(req, res, err, "Failed to update username");
  }
});

router.post(
  "/settings/profile/photo",
  upload.single("file"),
  async (req: Request, res: Response) => {
    const client = await getAuthedClient(req, res);
    if (!client) return;
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }
    if (!file.mimetype.startsWith("image/")) {
      res.status(400).json({ error: "Only image files are supported" });
      return;
    }
    try {
      res.json(await uploadProfilePhoto(client, file.buffer, file.mimetype));
    } catch (err) {
      handleError(req, res, err, "Failed to upload profile photo");
    }
  },
);

// ---------------------------------------------------------------------------
// Privacy
// ---------------------------------------------------------------------------

router.get("/settings/privacy", async (req: Request, res: Response) => {
  const client = await getAuthedClient(req, res);
  if (!client) return;
  try {
    res.json(await getPrivacy(client));
  } catch (err) {
    handleError(req, res, err, "Failed to get privacy settings");
  }
});

router.post("/settings/privacy", async (req: Request, res: Response) => {
  const client = await getAuthedClient(req, res);
  if (!client) return;
  const body = (req.body ?? {}) as {
    key?: string;
    value?: string;
  };
  const validKeys = ["lastSeen", "profilePhoto", "phone", "forwards", "calls"] as const;
  const validValues: PrivacyValue[] = ["everyone", "contacts", "nobody"];

  type PrivacyKey = (typeof validKeys)[number];
  const key = body.key as PrivacyKey | undefined;
  const value = body.value as PrivacyValue | undefined;

  if (!key || !validKeys.includes(key)) {
    res.status(400).json({ error: `key must be one of: ${validKeys.join(", ")}` });
    return;
  }
  if (!value || !validValues.includes(value)) {
    res.status(400).json({ error: `value must be one of: ${validValues.join(", ")}` });
    return;
  }
  try {
    res.json(await setPrivacy(client, key, value));
  } catch (err) {
    handleError(req, res, err, "Failed to update privacy");
  }
});

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

router.get("/settings/sessions", async (req: Request, res: Response) => {
  const client = await getAuthedClient(req, res);
  if (!client) return;
  try {
    res.json({ sessions: await getSessions(client) });
  } catch (err) {
    handleError(req, res, err, "Failed to get sessions");
  }
});

router.post("/settings/sessions/:hash/terminate", async (req: Request, res: Response) => {
  const client = await getAuthedClient(req, res);
  if (!client) return;
  const { hash } = req.params as { hash: string };
  try {
    res.json(await terminateSession(client, hash));
  } catch (err) {
    handleError(req, res, err, "Failed to terminate session");
  }
});

router.post("/settings/sessions/terminate-others", async (req: Request, res: Response) => {
  const client = await getAuthedClient(req, res);
  if (!client) return;
  try {
    res.json(await terminateAllOtherSessions(client));
  } catch (err) {
    handleError(req, res, err, "Failed to terminate all other sessions");
  }
});

// ---------------------------------------------------------------------------
// Blocked users
// ---------------------------------------------------------------------------

router.get("/settings/blocked", async (req: Request, res: Response) => {
  const client = await getAuthedClient(req, res);
  if (!client) return;
  try {
    res.json({ users: await getBlocked(client) });
  } catch (err) {
    handleError(req, res, err, "Failed to get blocked users");
  }
});

router.post("/settings/blocked/:peerId/unblock", async (req: Request, res: Response) => {
  const client = await getAuthedClient(req, res);
  if (!client) return;
  const { peerId } = req.params as { peerId: string };
  try {
    res.json(await unblockUser(client, peerId));
  } catch (err) {
    handleError(req, res, err, "Failed to unblock user");
  }
});

// ---------------------------------------------------------------------------
// Two-step verification (read-only)
// ---------------------------------------------------------------------------

router.get("/settings/2fa", async (req: Request, res: Response) => {
  const client = await getAuthedClient(req, res);
  if (!client) return;
  try {
    res.json(await get2FAStatus(client));
  } catch (err) {
    handleError(req, res, err, "Failed to get 2FA status");
  }
});

export default router;
