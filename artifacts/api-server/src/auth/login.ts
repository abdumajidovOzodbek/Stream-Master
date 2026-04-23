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

console.log(`\nUsing TELEGRAM_API_ID = ${apiId} (length of API_HASH = ${apiHash.length})`);
if (apiHash.length !== 32) {
  console.warn(
    "WARNING: TELEGRAM_API_HASH is not 32 characters long. It is usually a 32-char hex string. Double-check it on https://my.telegram.org/apps.",
  );
}

async function main() {
  const session = new StringSession("");
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
  });

  // Verbose gramjs logging so we can see code-send requests / errors
  client.setLogLevel("info" as never);

  console.log("\nLogging into Telegram as a user...");
  console.log("Tip: if you have Telegram open on another device, the code is sent");
  console.log("     IN-APP from the official 'Telegram' chat, not via SMS.");
  console.log("     If no other device is signed in, Telegram will fall back to SMS automatically.\n");

  await client.start({
    phoneNumber: async () => {
      const raw = await input.text("Phone number with country code (e.g. +14155551234): ");
      const trimmed = raw.trim();
      if (!trimmed.startsWith("+")) {
        console.warn(`WARNING: phone number "${trimmed}" doesn't start with '+'. Telegram requires the leading '+' and full country code.`);
      }
      return trimmed;
    },
    password: async () => await input.text("2FA password (leave blank if none): "),
    phoneCode: async () => {
      console.log(
        "\nA code request has been sent. Check the Telegram app on another device first, then SMS.",
      );
      return await input.text("Code from Telegram: ");
    },
    onError: (err) => {
      console.error("\nAuth error:", err);
    },
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
  console.error("\nLogin failed:", err);
  process.exit(1);
});
