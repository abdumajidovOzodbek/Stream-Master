import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { computeCheck } from "telegram/Password.js";
import { EventEmitter } from "node:events";
import { logger } from "../lib/logger";
import { getSession, saveSession, clearSession } from "./sessionStore";
import { registerUpdateHandlers } from "./telegramUpdates";
import { destroyBus } from "./updateBus";

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
  const record = await getSession(sessionId);
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

  // Register real-time update handlers after the client is built and connected.
  // Only register when this is an authenticated session (has a saved session string).
  const record = getSession(sessionId);
  if (record?.sessionString) {
    registerUpdateHandlers(client, sessionId);
  }

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
  destroyBus(sessionId);
  await clearSession(sessionId);
  logger.info({ sessionId }, "Session logged out and cleared");
}

/**
 * Called after a successful login to register update handlers on the
 * newly-authenticated client (it was built without them since it had no
 * session string at construction time).
 */
export async function registerHandlersForSession(sessionId: string): Promise<void> {
  const hit = cache.get(sessionId);
  if (hit) registerUpdateHandlers(hit.client, sessionId);
}

// ---------------------------------------------------------------------------
// Expose the in-process cache for SSE event subscriptions
// ---------------------------------------------------------------------------

export function getCachedClient(sessionId: string): TelegramClient | null {
  return cache.get(sessionId)?.client ?? null;
}

// ---------------------------------------------------------------------------
// QR code login helpers
// ---------------------------------------------------------------------------

export type QrEvent =
  | { type: "qr"; url: string; expires: number }
  | { type: "needsPassword" }
  | { type: "success" }
  | { type: "error"; message: string };

interface QrSession {
  emitter: EventEmitter;
  /** Resolve/reject for the 2FA password promise — both must be set together */
  passwordResolve: ((pw: string) => void) | null;
  passwordReject: ((err: Error) => void) | null;
  /** Last QR token event so newly-connected SSE clients get an immediate frame */
  lastQrEvent: (QrEvent & { type: "qr" }) | null;
  /** Set to true when the session should abort */
  cancelled: boolean;
}

const qrSessions = new Map<string, QrSession>();

function createQrSession(sessionId: string): QrSession {
  const s: QrSession = {
    emitter: new EventEmitter(),
    passwordResolve: null,
    passwordReject: null,
    lastQrEvent: null,
    cancelled: false,
  };
  s.emitter.setMaxListeners(10);
  qrSessions.set(sessionId, s);
  return s;
}

export function getQrEmitter(sessionId: string): EventEmitter | null {
  return qrSessions.get(sessionId)?.emitter ?? null;
}

/** Returns the most-recently-emitted QR token for replay to late SSE subscribers. */
export function getLastQrEvent(sessionId: string): (QrEvent & { type: "qr" }) | null {
  return qrSessions.get(sessionId)?.lastQrEvent ?? null;
}

export function cancelQrLogin(sessionId: string): void {
  const s = qrSessions.get(sessionId);
  if (!s) return;
  s.cancelled = true;
  // Unblock any pending 2FA password wait so the gramJS coroutine can exit
  if (s.passwordReject) {
    s.passwordReject(new Error("QR login cancelled"));
    s.passwordReject = null;
    s.passwordResolve = null;
  }
  s.emitter.emit("qr-event", { type: "error", message: "QR login cancelled" } satisfies QrEvent);
  s.emitter.removeAllListeners();
  qrSessions.delete(sessionId);
  logger.info({ sessionId }, "QR login cancelled");
}

export function submitQrPassword(sessionId: string, password: string): boolean {
  const s = qrSessions.get(sessionId);
  if (!s || !s.passwordResolve) return false;
  s.passwordResolve(password);
  s.passwordResolve = null;
  s.passwordReject = null;
  return true;
}

export async function startQrLogin(sessionId: string): Promise<void> {
  // Tear down any prior session first (also rejects a pending password wait)
  cancelQrLogin(sessionId);
  const session = createQrSession(sessionId);

  let c: TelegramClient;
  try {
    c = await getClientForSession(sessionId);
  } catch (err) {
    // Clean up the map entry so we don't leave an orphaned session with no producer
    qrSessions.delete(sessionId);
    throw err;
  }

  void (async () => {
    try {
      await c.signInUserWithQrCode(
        { apiId, apiHash },
        {
          onError: async (err: Error) => {
            if (session.cancelled) return true;
            logger.warn({ err, sessionId }, "QR login error");
            session.emitter.emit("qr-event", { type: "error", message: err.message } satisfies QrEvent);
            return false;
          },
          qrCode: async (qr: { token: Buffer; expires: number }) => {
            if (session.cancelled) return;
            const token = qr.token.toString("base64url");
            const url = `tg://login?token=${token}`;
            const event = { type: "qr" as const, url, expires: qr.expires };
            session.lastQrEvent = event;
            session.emitter.emit("qr-event", event satisfies QrEvent);
          },
          password: async () => {
            if (session.cancelled) return "";
            session.emitter.emit("qr-event", { type: "needsPassword" } satisfies QrEvent);
            // Wait for the browser to POST /auth/qr/password — or for cancellation
            const pw = await new Promise<string>((resolve, reject) => {
              session.passwordResolve = resolve;
              session.passwordReject = reject;
            });
            return pw;
          },
        },
      );

      if (session.cancelled) return;

      const sessionString = (c.session as StringSession).save();
      let meta: { userId?: string; firstName?: string; username?: string } = {};
      try {
        const me = (await c.getMe()) as Api.User;
        meta = {
          userId: me.id?.toString(),
          firstName: me.firstName ?? undefined,
          username: me.username ?? undefined,
        };
      } catch { /* best effort */ }

      await saveSession(sessionId, { sessionString, ...meta });
      registerHandlersForSession(sessionId);
      logger.info({ sessionId }, "QR login succeeded, session saved");

      session.emitter.emit("qr-event", { type: "success" } satisfies QrEvent);
    } catch (err) {
      // Swallow errors caused by our own cancellation; they are expected
      if (session.cancelled) return;
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ err, sessionId }, "QR login flow failed");
      session.emitter.emit("qr-event", { type: "error", message } satisfies QrEvent);
    } finally {
      // Only remove this specific session instance — a newer flow may have
      // replaced it already (e.g. rapid retry), and we must not evict that one.
      if (qrSessions.get(sessionId) === session) {
        qrSessions.delete(sessionId);
      }
    }
  })();
}
