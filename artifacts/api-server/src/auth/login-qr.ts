import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import qrcode from "qrcode-terminal";
import input from "input";

const apiId = Number(process.env["TELEGRAM_API_ID"]);
const apiHash = process.env["TELEGRAM_API_HASH"] ?? "";

if (!apiId || !apiHash) {
  console.error("Missing TELEGRAM_API_ID or TELEGRAM_API_HASH environment variables.");
  process.exit(1);
}

async function main() {
  const session = new StringSession("");
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
  });

  client.setLogLevel("error" as never);

  console.log("\nConnecting to Telegram...");
  await client.connect();

  console.log("\nLogging in via QR code.");
  console.log("On your phone:  Telegram → Settings → Devices → Link Desktop Device");
  console.log("Then point your phone camera at the QR code below.\n");

  await client.signInUserWithQrCode(
    { apiId, apiHash },
    {
      onError: async (err: Error) => {
        console.error("\nQR auth error:", err.message);
        return false;
      },
      qrCode: async (qr: { token: Buffer; expires: number }) => {
        const token = qr.token.toString("base64url");
        const url = `tg://login?token=${token}`;
        console.log("\n--- Scan this QR code with the Telegram app on your phone ---\n");
        qrcode.generate(url, { small: true });
        console.log(`\n(QR expires in ~${qr.expires}s — a new one will appear if it does)\n`);
      },
      password: async () => {
        return await input.text("2FA password (leave blank if none): ");
      },
    },
  );

  const me = (await client.getMe()) as Api.User;
  console.log(`\nLogged in as: @${me.username ?? me.firstName ?? "(unknown)"}`);

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
