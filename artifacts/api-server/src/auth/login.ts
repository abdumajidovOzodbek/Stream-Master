import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import input from "input";

const apiId = Number(process.env["TELEGRAM_API_ID"]);
const apiHash = process.env["TELEGRAM_API_HASH"] ?? "";

if (!apiId || !apiHash) {
  console.error(
    "Missing TELEGRAM_API_ID or TELEGRAM_API_HASH environment variables.",
  );
  process.exit(1);
}

async function main() {
  const session = new StringSession("");
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
  });

  console.log("\nLogging into Telegram as a user...\n");

  await client.start({
    phoneNumber: async () => await input.text("Phone number (e.g. +14155551234): "),
    password: async () => await input.text("2FA password (leave blank if none): "),
    phoneCode: async () => await input.text("Code from Telegram: "),
    onError: (err) => console.error("Auth error:", err),
  });

  const sessionString = client.session.save() as unknown as string;

  console.log("\n========================================================");
  console.log("Login successful! Your session string is below.");
  console.log("Add it as the secret named TELEGRAM_SESSION:");
  console.log("========================================================\n");
  console.log(sessionString);
  console.log("\n========================================================\n");

  await client.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
