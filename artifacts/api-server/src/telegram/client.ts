import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { computeCheck } from "telegram/Password.js";
import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { logger } from "../lib/logger";

const STORAGE_DIR = path.resolve(process.cwd(), "storage");

const apiId = Number(process.env["TELEGRAM_API_ID"]);
const apiHash = process.env["TELEGRAM_API_HASH"] ?? "";

if (!apiId || !apiHash) {
  throw new Error(
    "TELEGRAM_API_ID and TELEGRAM_API_HASH must be set as environment variables.",
  );
}

const SESSION_FILE = path.join(STORAGE_DIR, "session.txt");

function loadSessionString(): string {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      // File takes priority — even if empty (after logout), it means "not logged in".
      return fs.readFileSync(SESSION_FILE, "utf8").trim();
    }
  } catch (err) {
    logger.warn({ err }, "Failed to read session file");
  }
  return process.env["TELEGRAM_SESSION"]?.trim() ?? "";
}

async function saveSessionString(s: string): Promise<void> {
  await fsp.mkdir(path.dirname(SESSION_FILE), { recursive: true });
  await fsp.writeFile(SESSION_FILE, s, "utf8");
}

async function clearSessionFile(): Promise<void> {
  // Write empty file (rather than delete) so the env var TELEGRAM_SESSION
  // doesn't silently re-authenticate after logout.
  await fsp.mkdir(path.dirname(SESSION_FILE), { recursive: true });
  await fsp.writeFile(SESSION_FILE, "", "utf8");
}

let client: TelegramClient | null = null;
let connecting: Promise<TelegramClient> | null = null;

async function buildClient(): Promise<TelegramClient> {
  const sessionString = loadSessionString();
  const session = new StringSession(sessionString);
  const c = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
    useWSS: false,
    autoReconnect: true,
  });
  c.setLogLevel("error" as never);
  await c.connect();
  if (sessionString) {
    try {
      const me = await c.getMe();
      logger.info(
        {
          user:
            (me as { username?: string }).username ??
            (me as { firstName?: string }).firstName,
        },
        "Telegram client connected",
      );
    } catch (err) {
      logger.warn({ err }, "Connected but getMe failed (session may be invalid)");
    }
  } else {
    logger.info("Telegram client connected (unauthenticated)");
  }
  return c;
}

/** Returns the underlying client (may or may not be authenticated). */
export function getRawClient(): Promise<TelegramClient> {
  if (client) return Promise.resolve(client);
  if (connecting) return connecting;
  connecting = buildClient()
    .then((c) => {
      client = c;
      connecting = null;
      return c;
    })
    .catch((err) => {
      connecting = null;
      logger.error({ err }, "Failed to initialize Telegram client");
      throw err;
    });
  return connecting;
}

/** Returns an authenticated client. Throws NOT_LOGGED_IN if not signed in. */
export async function getTelegramClient(): Promise<TelegramClient> {
  const c = await getRawClient();
  const authed = await c.isUserAuthorized();
  if (!authed) {
    const err = new Error("NOT_LOGGED_IN");
    (err as Error & { code?: string }).code = "NOT_LOGGED_IN";
    throw err;
  }
  return c;
}

export async function isAuthenticated(): Promise<boolean> {
  try {
    const c = await getRawClient();
    return await c.isUserAuthorized();
  } catch {
    return false;
  }
}

export async function startLogin(phone: string): Promise<{
  phoneCodeHash: string;
  isCodeViaApp: boolean;
}> {
  const c = await getRawClient();
  const result = (await c.invoke(
    new Api.auth.SendCode({
      phoneNumber: phone,
      apiId,
      apiHash,
      settings: new Api.CodeSettings({}),
    }),
  )) as Api.auth.SentCode;
  return {
    phoneCodeHash: result.phoneCodeHash,
    isCodeViaApp:
      result.type instanceof Api.auth.SentCodeTypeApp,
  };
}

export async function completeLogin(opts: {
  phone: string;
  phoneCodeHash: string;
  code: string;
  password?: string;
}): Promise<{ ok: true } | { needsPassword: true }> {
  const c = await getRawClient();
  try {
    await c.invoke(
      new Api.auth.SignIn({
        phoneNumber: opts.phone,
        phoneCodeHash: opts.phoneCodeHash,
        phoneCode: opts.code,
      }),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("SESSION_PASSWORD_NEEDED")) {
      if (!opts.password) {
        return { needsPassword: true };
      }
      const passwordInfo = (await c.invoke(
        new Api.account.GetPassword(),
      )) as Api.account.Password;
      const srp = await computeCheck(passwordInfo, opts.password);
      await c.invoke(new Api.auth.CheckPassword({ password: srp }));
    } else {
      throw err;
    }
  }
  const sessionString = (c.session as StringSession).save();
  await saveSessionString(sessionString);
  logger.info("Saved session after successful login");
  return { ok: true };
}

export async function logout(): Promise<void> {
  if (client) {
    try {
      await client.invoke(new Api.auth.LogOut());
    } catch (err) {
      logger.warn({ err }, "auth.LogOut failed (continuing anyway)");
    }
    try {
      await client.disconnect();
    } catch {
      /* ignore */
    }
    try {
      await client.destroy();
    } catch {
      /* ignore */
    }
    client = null;
  }
  await clearSessionFile();
  logger.info("Logged out and cleared session");
}
