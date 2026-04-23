import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { logger } from "../lib/logger";

const apiId = Number(process.env["TELEGRAM_API_ID"]);
const apiHash = process.env["TELEGRAM_API_HASH"] ?? "";
const sessionString = process.env["TELEGRAM_SESSION"] ?? "";

if (!apiId || !apiHash) {
  throw new Error(
    "TELEGRAM_API_ID and TELEGRAM_API_HASH must be set as environment variables.",
  );
}

let clientPromise: Promise<TelegramClient> | null = null;

export function getTelegramClient(): Promise<TelegramClient> {
  if (clientPromise) return clientPromise;

  clientPromise = (async () => {
    const session = new StringSession(sessionString);
    const client = new TelegramClient(session, apiId, apiHash, {
      connectionRetries: 5,
      useWSS: false,
      autoReconnect: true,
    });

    // Suppress noisy gramjs internal logs
    client.setLogLevel("error" as never);

    if (!sessionString) {
      throw new Error(
        "TELEGRAM_SESSION is empty. Run `pnpm --filter @workspace/api-server run login` to generate a session string, then add it to the TELEGRAM_SESSION secret.",
      );
    }

    await client.connect();
    const me = await client.getMe();
    logger.info(
      { user: (me as { username?: string }).username ?? (me as { firstName?: string }).firstName },
      "Telegram client connected",
    );
    return client;
  })();

  clientPromise.catch((err) => {
    clientPromise = null;
    logger.error({ err }, "Failed to initialize Telegram client");
  });

  return clientPromise;
}
