import { TelegramClient, Api } from "telegram";
import bigInt from "big-integer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PrivacyValue = "everyone" | "contacts" | "nobody";

export interface ProfileInfo {
  firstName: string;
  lastName: string;
  username: string;
  phone: string;
  bio: string;
}

export interface PrivacySettings {
  lastSeen: PrivacyValue;
  profilePhoto: PrivacyValue;
  phone: PrivacyValue;
  forwards: PrivacyValue;
  calls: PrivacyValue;
}

export interface SessionInfo {
  hash: string;
  isCurrent: boolean;
  deviceModel: string;
  platform: string;
  systemVersion: string;
  appName: string;
  appVersion: string;
  dateCreated: number;
  dateActive: number;
  ip: string;
  country: string;
  region: string;
}

export interface BlockedUser {
  id: string;
  name: string;
  username: string | null;
}

export interface TwoFAStatus {
  hasPassword: boolean;
  hint: string;
  emailUnconfirmedPattern: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toPrivacyValue(rules: Api.TypePrivacyRule[]): PrivacyValue {
  const first = rules[0];
  if (!first) return "everyone";
  if (first instanceof Api.PrivacyValueAllowAll) return "everyone";
  if (first instanceof Api.PrivacyValueAllowContacts) return "contacts";
  if (first instanceof Api.PrivacyValueDisallowAll) return "nobody";
  return "everyone";
}

function fromPrivacyValue(value: PrivacyValue): Api.TypeInputPrivacyRule {
  if (value === "contacts") return new Api.InputPrivacyValueAllowContacts();
  if (value === "nobody") return new Api.InputPrivacyValueDisallowAll();
  return new Api.InputPrivacyValueAllowAll();
}

function bigToStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  return (v as { toString(): string }).toString();
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export async function getProfile(client: TelegramClient): Promise<ProfileInfo> {
  const full = await client.invoke(new Api.users.GetFullUser({ id: new Api.InputUserSelf() }));
  const user = full.users[0] as Api.User;
  return {
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    username: user.username ?? "",
    phone: user.phone ?? "",
    bio: full.fullUser.about ?? "",
  };
}

export async function updateProfile(
  client: TelegramClient,
  data: { firstName?: string; lastName?: string; bio?: string },
): Promise<{ ok: true }> {
  await client.invoke(
    new Api.account.UpdateProfile({
      firstName: data.firstName,
      lastName: data.lastName,
      about: data.bio,
    }),
  );
  return { ok: true };
}

export async function updateUsername(
  client: TelegramClient,
  username: string,
): Promise<{ ok: true }> {
  await client.invoke(new Api.account.UpdateUsername({ username }));
  return { ok: true };
}

export async function uploadProfilePhoto(
  client: TelegramClient,
  buffer: Buffer,
  mimeType: string,
): Promise<{ ok: true }> {
  const ext = mimeType.includes("png") ? "png" : "jpg";
  const { CustomFile } = await import("telegram/client/uploads.js");
  const customFile = new CustomFile(`photo.${ext}`, buffer.length, `photo.${ext}`, buffer);
  const uploaded = await client.uploadFile({ file: customFile as never, workers: 1 });
  await client.invoke(new Api.photos.UploadProfilePhoto({ file: uploaded }));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Privacy
// ---------------------------------------------------------------------------

export async function getPrivacy(client: TelegramClient): Promise<PrivacySettings> {
  const [lastSeen, profilePhoto, phone, forwards, calls] = await Promise.all([
    client.invoke(new Api.account.GetPrivacy({ key: new Api.InputPrivacyKeyStatusTimestamp() })),
    client.invoke(new Api.account.GetPrivacy({ key: new Api.InputPrivacyKeyProfilePhoto() })),
    client.invoke(new Api.account.GetPrivacy({ key: new Api.InputPrivacyKeyPhoneNumber() })),
    client.invoke(new Api.account.GetPrivacy({ key: new Api.InputPrivacyKeyForwards() })),
    client.invoke(new Api.account.GetPrivacy({ key: new Api.InputPrivacyKeyPhoneCall() })),
  ]);
  return {
    lastSeen: toPrivacyValue(lastSeen.rules),
    profilePhoto: toPrivacyValue(profilePhoto.rules),
    phone: toPrivacyValue(phone.rules),
    forwards: toPrivacyValue(forwards.rules),
    calls: toPrivacyValue(calls.rules),
  };
}

export async function setPrivacy(
  client: TelegramClient,
  key: keyof PrivacySettings,
  value: PrivacyValue,
): Promise<{ ok: true }> {
  const keyMap: Record<keyof PrivacySettings, Api.TypeInputPrivacyKey> = {
    lastSeen: new Api.InputPrivacyKeyStatusTimestamp(),
    profilePhoto: new Api.InputPrivacyKeyProfilePhoto(),
    phone: new Api.InputPrivacyKeyPhoneNumber(),
    forwards: new Api.InputPrivacyKeyForwards(),
    calls: new Api.InputPrivacyKeyPhoneCall(),
  };
  await client.invoke(
    new Api.account.SetPrivacy({
      key: keyMap[key],
      rules: [fromPrivacyValue(value)],
    }),
  );
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function getSessions(client: TelegramClient): Promise<SessionInfo[]> {
  const result = await client.invoke(new Api.account.GetAuthorizations());
  return result.authorizations.map((auth) => ({
    hash: bigToStr(auth.hash),
    isCurrent: auth.current ?? false,
    deviceModel: auth.deviceModel,
    platform: auth.platform,
    systemVersion: auth.systemVersion,
    appName: auth.appName,
    appVersion: auth.appVersion,
    dateCreated: auth.dateCreated,
    dateActive: auth.dateActive,
    ip: auth.ip,
    country: auth.country,
    region: auth.region,
  }));
}

export async function terminateSession(
  client: TelegramClient,
  hash: string,
): Promise<{ ok: true }> {
  await client.invoke(new Api.account.ResetAuthorization({ hash: bigInt(hash) }));
  return { ok: true };
}

export async function terminateAllOtherSessions(client: TelegramClient): Promise<{ ok: true }> {
  await client.invoke(new Api.account.ResetAuthorizations());
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Blocked users
// ---------------------------------------------------------------------------

export async function getBlocked(client: TelegramClient): Promise<BlockedUser[]> {
  const result = await client.invoke(new Api.contacts.GetBlocked({ offset: 0, limit: 100 }));
  const users: Api.TypeUser[] =
    "users" in result
      ? (result.users as Api.TypeUser[])
      : [];
  return users
    .filter((u): u is Api.User => u instanceof Api.User)
    .map((u) => {
      const first = u.firstName ?? "";
      const last = u.lastName ?? "";
      const name = `${first} ${last}`.trim() || u.username || `User ${bigToStr(u.id)}`;
      return { id: bigToStr(u.id), name, username: u.username ?? null };
    });
}

export async function unblockUser(
  client: TelegramClient,
  peerId: string,
): Promise<{ ok: true }> {
  const entity = await client.getInputEntity(peerId);
  await client.invoke(new Api.contacts.Unblock({ id: entity }));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Two-step verification
// ---------------------------------------------------------------------------

export async function get2FAStatus(client: TelegramClient): Promise<TwoFAStatus> {
  const result = await client.invoke(new Api.account.GetPassword());
  return {
    hasPassword: result.hasPassword ?? false,
    hint: result.hint ?? "",
    emailUnconfirmedPattern:
      (result as unknown as { emailUnconfirmedPattern?: string }).emailUnconfirmedPattern ?? null,
  };
}
