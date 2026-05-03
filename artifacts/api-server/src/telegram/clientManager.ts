import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { computeCheck } from "telegram/Password.js";
import { logger } from "../lib/logger";
import { getSession, saveSession, clearSession } from "./sessionStore";

const apiId = Number(process.env["TELEGRAM_API_ID"]);
const apiHash = process.env["TELEGRAM_API_HASH"] ?? "";

if (!apiId || !apiHash) {
  throw new Error("TELEGRAM_API_ID and TELEGRAM_API_HASH must be set as environment variables.");
}

const IDLE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const EVICTION_INTERVAL_MS = 10 * 60 * 1000; // check every 10 minutes

interface CachedClient {
  client: TelegramClient;
  lastUsed: number;
}

const cache = new Map<string, CachedClient>();

// ---------------------------------------------------------------------------
// Periodic idle eviction — disconnects clients unused for >30 min
// ---------------------------------------------------------------------------

async function evictIdleClients(): Promise<void> {
  const cutoff = Date.now() - IDLE_TTL_MS;
  const toEvict = [...cache.entries()].filter(([, v]) => v.lastUsed < cutoff);
  for (const [sessionId, { client }] of toEvict) {
    cache.delete(sessionId);
    try { await client.disconnect(); } catch { /* ignore */ }
    logger.info({ sessionId }, "Evicted idle TelegramClient from cache");
  }
}

setInterval(() => { void evictIdleClients(); }, EVICTION_INTERVAL_MS);

// ---------------------------------------------------------------------------
// Client construction
// ---------------------------------------------------------------------------

async function buildClient(sessionId: string): Promise<TelegramClient> {
  const record = getSession(sessionId);
  const sessionString = record?.sessionString ?? "";
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
        { sessionId, user: (me as { username?: string }).username ?? (me as { firstName?: string }).firstName },
        "Telegram session reconnected",
      );
    } catch (err) {
      logger.warn({ err, sessionId }, "Connected but getMe failed (session may be invalid)");
    }
  } else {
    logger.info({ sessionId }, "Telegram session started (unauthenticated)");
  }

  return c;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getClientForSession(sessionId: string): Promise<TelegramClient> {
  const hit = cache.get(sessionId);
  if (hit) { hit.lastUsed = Date.now(); return hit.client; }

  const client = await buildClient(sessionId);
  cache.set(sessionId, { client, lastUsed: Date.now() });
  return client;
}

export async function isSessionAuthenticated(sessionId: string): Promise<boolean> {
  try {
    const c = await getClientForSession(sessionId);
    return await c.isUserAuthorized();
  } catch {
    return false;
  }
}

export async function startSessionLogin(
  sessionId: string,
  phone: string,
): Promise<{ phoneCodeHash: string; isCodeViaApp: boolean }> {
  const c = await getClientForSession(sessionId);
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
    isCodeViaApp: result.type instanceof Api.auth.SentCodeTypeApp,
  };
}

export async function completeSessionLogin(
  sessionId: string,
  opts: { phone: string; phoneCodeHash: string; code: string; password?: string },
): Promise<{ ok: true } | { needsPassword: true }> {
  const c = await getClientForSession(sessionId);
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
      if (!opts.password) return { needsPassword: true };
      const passwordInfo = (await c.invoke(new Api.account.GetPassword())) as Api.account.Password;
      const srp = await computeCheck(passwordInfo, opts.password);
      await c.invoke(new Api.auth.CheckPassword({ password: srp }));
    } else {
      throw err;
    }
  }

  const sessionString = (c.session as StringSession).save();
  let meta: { phone?: string; userId?: string; firstName?: string; username?: string } = {
    phone: opts.phone,
  };
  try {
    const me = (await c.getMe()) as Api.User;
    meta = {
      phone: opts.phone,
      userId: me.id?.toString(),
      firstName: me.firstName ?? undefined,
      username: me.username ?? undefined,
    };
  } catch { /* meta stays as phone-only */ }

  await saveSession(sessionId, { sessionString, ...meta });
  logger.info({ sessionId }, "Session saved after successful login");
  return { ok: true };
}

export async function logoutSession(sessionId: string): Promise<void> {
  const hit = cache.get(sessionId);
  if (hit) {
    try { await hit.client.invoke(new Api.auth.LogOut()); } catch { /* ignore */ }
    try { await hit.client.disconnect(); } catch { /* ignore */ }
    try { await hit.client.destroy(); } catch { /* ignore */ }
    cache.delete(sessionId);
  }
  await clearSession(sessionId);
  logger.info({ sessionId }, "Session logged out and cleared");
}
