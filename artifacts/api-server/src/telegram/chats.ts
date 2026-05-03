import { Api } from "telegram";
import bigInt from "big-integer";
import path from "node:path";
import { getTelegramClient } from "./client";
import { logger } from "../lib/logger";

export type UserPresence =
  | { kind: "online"; expires: number }
  | { kind: "offline"; wasOnline: number }
  | { kind: "recently" }
  | { kind: "lastWeek" }
  | { kind: "lastMonth" }
  | { kind: "longAgo" };

export interface Reaction {
  emoji: string;
  count: number;
  chosen: boolean;
}

export interface DialogEntry {
  id: string;
  type: "user" | "chat" | "channel";
  title: string;
  username: string | null;
  unreadCount: number;
  isPinned: boolean;
  isVerified: boolean;
  isBot: boolean;
  hasPhoto: boolean;
  readInboxMaxId: number | null;
  readOutboxMaxId: number | null;
  presence: UserPresence | null;
  lastMessage: {
    id: number;
    text: string;
    date: number;
    out: boolean;
  } | null;
}

export interface ReplyPreview {
  id: number;
  text: string;
  senderName: string | null;
  hasMedia: boolean;
}

export interface ForwardInfo {
  fromName: string | null;
  date: number;
}

export interface MessageEntry {
  id: number;
  date: number;
  editDate: number | null;
  out: boolean;
  text: string;
  fromId: string | null;
  fromName: string | null;
  senderHasPhoto: boolean;
  replyToMsgId: number | null;
  replyTo: ReplyPreview | null;
  fwdFrom: ForwardInfo | null;
  views: number | null;
  reactions: Reaction[];
  media: MessageMedia | null;
}

export type MessageMedia =
  | {
      kind: "photo";
      width: number | null;
      height: number | null;
      url: string;
    }
  | {
      kind: "video";
      width: number | null;
      height: number | null;
      duration: number | null;
      mimeType: string | null;
      size: number | null;
      url: string;
      thumbUrl: string | null;
    }
  | {
      kind: "document";
      fileName: string;
      mimeType: string | null;
      size: number | null;
      url: string;
    }
  | {
      kind: "audio" | "voice";
      duration: number | null;
      mimeType: string | null;
      size: number | null;
      url: string;
    }
  | {
      kind: "sticker";
      url: string;
      mimeType: string | null;
    }
  | {
      kind: "webpage";
      title: string | null;
      description: string | null;
      url: string | null;
    }
  | {
      kind: "other";
      label: string;
    };

export interface MeInfo {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  phone: string | null;
}

export interface UserInfo {
  id: string;
  name: string;
  username: string | null;
  bio: string | null;
  phone: string | null;
  isBot: boolean;
  hasPhoto: boolean;
  type: "user" | "chat" | "channel";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bigToString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  return (v as { toString: () => string }).toString();
}

function entityType(entity: unknown): "user" | "chat" | "channel" {
  if (entity instanceof Api.User) return "user";
  if (entity instanceof Api.Channel) return "channel";
  if (entity instanceof Api.Chat || entity instanceof Api.ChatForbidden) return "chat";
  if (entity instanceof Api.ChannelForbidden) return "channel";
  return "user";
}

function entityTitle(entity: unknown): string {
  if (entity instanceof Api.User) {
    const first = entity.firstName ?? "";
    const last = entity.lastName ?? "";
    const name = `${first} ${last}`.trim();
    return name || entity.username || `User ${bigToString(entity.id)}`;
  }
  if (
    entity instanceof Api.Channel ||
    entity instanceof Api.Chat ||
    entity instanceof Api.ChatForbidden ||
    entity instanceof Api.ChannelForbidden
  ) {
    return (entity as { title?: string }).title ?? "Untitled";
  }
  return "Unknown";
}

function userPresence(user: Api.User): UserPresence | null {
  const status = user.status;
  if (!status) return null;
  if (status instanceof Api.UserStatusOnline) {
    return { kind: "online", expires: status.expires };
  }
  if (status instanceof Api.UserStatusOffline) {
    return { kind: "offline", wasOnline: status.wasOnline };
  }
  if (status instanceof Api.UserStatusRecently) return { kind: "recently" };
  if (status instanceof Api.UserStatusLastWeek) return { kind: "lastWeek" };
  if (status instanceof Api.UserStatusLastMonth) return { kind: "lastMonth" };
  return null;
}

function extractReactions(msg: Api.Message): Reaction[] {
  const raw = (msg as unknown as { reactions?: Api.MessageReactions }).reactions;
  if (!raw?.results) return [];
  const out: Reaction[] = [];
  for (const rc of raw.results) {
    if (!(rc instanceof Api.ReactionCount)) continue;
    const r = rc.reaction;
    if (!(r instanceof Api.ReactionEmoji)) continue;
    out.push({
      emoji: r.emoticon,
      count: rc.count,
      chosen: typeof rc.chosenOrder === "number",
    });
  }
  return out;
}

function summarizeMessageText(msg: Api.Message | undefined): string {
  if (!msg) return "";
  if (msg.message) return msg.message;
  const media = msg.media;
  if (!media) return "";
  if (media instanceof Api.MessageMediaPhoto) return "📷 Photo";
  if (media instanceof Api.MessageMediaDocument) {
    const doc = media.document;
    if (doc instanceof Api.Document) {
      const isVideo = doc.attributes.some((a) => a instanceof Api.DocumentAttributeVideo);
      const isVoice = doc.attributes.some(
        (a) => a instanceof Api.DocumentAttributeAudio && a.voice,
      );
      const isAudio = doc.attributes.some(
        (a) => a instanceof Api.DocumentAttributeAudio && !a.voice,
      );
      const isSticker = doc.attributes.some((a) => a instanceof Api.DocumentAttributeSticker);
      if (isVideo) return "🎬 Video";
      if (isVoice) return "🎤 Voice message";
      if (isAudio) return "🎵 Audio";
      if (isSticker) return "💟 Sticker";
      return "📎 Document";
    }
  }
  if (media instanceof Api.MessageMediaWebPage) return "🔗 Link";
  if (media instanceof Api.MessageMediaContact) return "👤 Contact";
  if (media instanceof Api.MessageMediaGeo) return "📍 Location";
  if (media instanceof Api.MessageMediaPoll) return "📊 Poll";
  return "";
}

// ---------------------------------------------------------------------------
// Entity resolution
// ---------------------------------------------------------------------------

interface ResolvedEntity {
  entity: Api.TypeEntityLike;
  type: "user" | "chat" | "channel";
  id: string;
}

async function resolveEntity(chatId: string): Promise<ResolvedEntity> {
  const client = await getTelegramClient();
  let entity: unknown;
  try {
    entity = await client.getEntity(chatId);
  } catch {
    await client.getDialogs({ limit: 200 });
    entity = await client.getEntity(bigInt(chatId));
  }
  return {
    entity: entity as Api.TypeEntityLike,
    type: entityType(entity),
    id: bigToString((entity as { id: unknown }).id),
  };
}

// ---------------------------------------------------------------------------
// Media extraction
// ---------------------------------------------------------------------------

function extractMessageMedia(msg: Api.Message, chatId: string): MessageMedia | null {
  const media = msg.media;
  if (!media) return null;
  const url = `/api/media/${chatId}/${msg.id}`;

  if (media instanceof Api.MessageMediaPhoto) {
    const photo = media.photo;
    let width: number | null = null;
    let height: number | null = null;
    if (photo instanceof Api.Photo) {
      const sizes = photo.sizes;
      const last = sizes[sizes.length - 1];
      if (last && "w" in last && "h" in last) {
        width = (last as unknown as { w: number }).w;
        height = (last as unknown as { h: number }).h;
      }
    }
    return { kind: "photo", width, height, url };
  }

  if (media instanceof Api.MessageMediaDocument) {
    const doc = media.document;
    if (!(doc instanceof Api.Document)) return { kind: "other", label: "Document" };
    const size = doc.size != null ? Number(doc.size as unknown as bigint | number) : null;
    const mimeType = doc.mimeType ?? null;

    const videoAttr = doc.attributes.find(
      (a): a is Api.DocumentAttributeVideo => a instanceof Api.DocumentAttributeVideo,
    );
    const audioAttr = doc.attributes.find(
      (a): a is Api.DocumentAttributeAudio => a instanceof Api.DocumentAttributeAudio,
    );
    const fileAttr = doc.attributes.find(
      (a): a is Api.DocumentAttributeFilename => a instanceof Api.DocumentAttributeFilename,
    );
    const stickerAttr = doc.attributes.find(
      (a): a is Api.DocumentAttributeSticker => a instanceof Api.DocumentAttributeSticker,
    );

    if (videoAttr) {
      return {
        kind: "video",
        width: videoAttr.w ?? null,
        height: videoAttr.h ?? null,
        duration: videoAttr.duration ?? null,
        mimeType,
        size,
        url,
        thumbUrl: `/api/media/${chatId}/${msg.id}?thumb=1`,
      };
    }
    if (audioAttr) {
      return {
        kind: audioAttr.voice ? "voice" : "audio",
        duration: audioAttr.duration ?? null,
        mimeType,
        size,
        url,
      };
    }
    if (stickerAttr) {
      return { kind: "sticker", url, mimeType };
    }
    return {
      kind: "document",
      fileName: fileAttr?.fileName ?? "file",
      mimeType,
      size,
      url,
    };
  }

  if (media instanceof Api.MessageMediaWebPage) {
    const w = media.webpage;
    if (w instanceof Api.WebPage) {
      return {
        kind: "webpage",
        title: w.title ?? null,
        description: w.description ?? null,
        url: w.url ?? null,
      };
    }
    return { kind: "webpage", title: null, description: null, url: null };
  }

  if (media instanceof Api.MessageMediaContact) return { kind: "other", label: "Contact" };
  if (media instanceof Api.MessageMediaGeo) return { kind: "other", label: "Location" };
  if (media instanceof Api.MessageMediaPoll) return { kind: "other", label: "Poll" };
  return { kind: "other", label: "Unsupported media" };
}

function fwdFromInfo(m: Api.Message): ForwardInfo | null {
  const f = m.fwdFrom;
  if (!f) return null;
  let fromName: string | null = null;
  if (f.fromName) fromName = f.fromName;
  return { fromName, date: f.date };
}

// ---------------------------------------------------------------------------
// Core message builder (shared by listMessages + searchMessages)
// ---------------------------------------------------------------------------

function buildMessageEntry(
  m: Api.Message,
  resolvedId: string,
  replyPreviews: Map<number, ReplyPreview>,
): MessageEntry {
  const fromIdRaw = (m.fromId ?? m.peerId) as unknown;
  let fromId: string | null = null;
  if (fromIdRaw instanceof Api.PeerUser) fromId = bigToString(fromIdRaw.userId);
  else if (fromIdRaw instanceof Api.PeerChannel) fromId = bigToString(fromIdRaw.channelId);
  else if (fromIdRaw instanceof Api.PeerChat) fromId = bigToString(fromIdRaw.chatId);

  const sender = (m as unknown as { sender?: unknown }).sender;
  const fromName = sender ? entityTitle(sender) : null;
  const senderHasPhoto = !!(sender as { photo?: unknown } | undefined)?.photo;

  const replyToMsgId =
    m.replyTo instanceof Api.MessageReplyHeader
      ? m.replyTo.replyToMsgId ?? null
      : null;
  const replyTo =
    replyToMsgId != null ? replyPreviews.get(replyToMsgId) ?? null : null;

  return {
    id: m.id,
    date: m.date,
    editDate: (m as unknown as { editDate?: number }).editDate ?? null,
    out: !!m.out,
    text: m.message ?? "",
    fromId,
    fromName,
    senderHasPhoto,
    replyToMsgId,
    replyTo,
    fwdFrom: fwdFromInfo(m),
    views: (m as unknown as { views?: number }).views ?? null,
    reactions: extractReactions(m),
    media: extractMessageMedia(m, resolvedId),
  };
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

export async function getMe(): Promise<MeInfo> {
  const client = await getTelegramClient();
  const me = (await client.getMe()) as Api.User;
  return {
    id: bigToString(me.id),
    firstName: me.firstName ?? null,
    lastName: me.lastName ?? null,
    username: me.username ?? null,
    phone: me.phone ?? null,
  };
}

export async function listDialogs(limit = 100): Promise<DialogEntry[]> {
  const client = await getTelegramClient();
  const dialogs = await client.getDialogs({ limit });

  const out: DialogEntry[] = [];
  for (const d of dialogs) {
    const entity = d.entity;
    if (!entity) continue;
    const type = entityType(entity);
    const title = entityTitle(entity);
    const username = (entity as { username?: string | null }).username ?? null;
    const isBot = entity instanceof Api.User && !!entity.bot;
    const isVerified = (entity as { verified?: boolean }).verified ?? false;
    const hasPhoto = !!(entity as { photo?: unknown }).photo;

    const lastMessage = d.message
      ? {
          id: d.message.id,
          text: summarizeMessageText(d.message),
          date: d.message.date,
          out: !!d.message.out,
        }
      : null;

    const rawDialog = (d as unknown as { dialog?: Api.Dialog }).dialog;
    const readInboxMaxId =
      rawDialog && typeof rawDialog.readInboxMaxId === "number"
        ? rawDialog.readInboxMaxId
        : null;
    const readOutboxMaxId =
      rawDialog && typeof rawDialog.readOutboxMaxId === "number"
        ? rawDialog.readOutboxMaxId
        : null;

    const presence =
      entity instanceof Api.User && !entity.bot ? userPresence(entity) : null;

    out.push({
      id: bigToString((entity as { id: unknown }).id),
      type,
      title,
      username,
      unreadCount: d.unreadCount ?? 0,
      isPinned: !!d.pinned,
      isVerified,
      isBot,
      hasPhoto,
      readInboxMaxId,
      readOutboxMaxId,
      presence,
      lastMessage,
    });
  }
  return out;
}

export async function listMessages(
  chatId: string,
  limit: number,
  offsetId: number | undefined,
): Promise<{ chatId: string; messages: MessageEntry[] }> {
  const { entity, id: resolvedId } = await resolveEntity(chatId);
  const client = await getTelegramClient();
  const messages = await client.getMessages(entity, {
    limit,
    offsetId: offsetId ?? 0,
  });

  // Batch-fetch the replied-to messages so we can render preview bubbles.
  const replyIds = new Set<number>();
  for (const m of messages) {
    if (
      m.replyTo instanceof Api.MessageReplyHeader &&
      m.replyTo.replyToMsgId != null
    ) {
      replyIds.add(m.replyTo.replyToMsgId);
    }
  }
  const replyPreviews = new Map<number, ReplyPreview>();
  if (replyIds.size > 0) {
    try {
      const targets = await client.getMessages(entity, {
        ids: Array.from(replyIds),
      });
      for (const t of targets) {
        if (!t || typeof t.id !== "number") continue;
        const sender = (t as unknown as { sender?: unknown }).sender;
        replyPreviews.set(t.id, {
          id: t.id,
          text: t.message ?? "",
          senderName: sender ? entityTitle(sender) : null,
          hasMedia: !!t.media,
        });
      }
    } catch (err) {
      logger.warn({ err, chatId: resolvedId }, "Failed to fetch reply previews");
    }
  }

  const out: MessageEntry[] = messages.map((m) =>
    buildMessageEntry(m, resolvedId, replyPreviews),
  );

  return { chatId: resolvedId, messages: out };
}

export async function searchMessages(
  chatId: string,
  query: string,
  limit = 20,
): Promise<{ chatId: string; messages: MessageEntry[] }> {
  const { entity, id: resolvedId } = await resolveEntity(chatId);
  const client = await getTelegramClient();
  const messages = await client.getMessages(entity, {
    search: query,
    limit,
  });
  const emptyMap = new Map<number, ReplyPreview>();
  const out = messages.map((m) => buildMessageEntry(m, resolvedId, emptyMap));
  return { chatId: resolvedId, messages: out };
}

export async function getUserInfo(peerId: string): Promise<UserInfo> {
  const { entity } = await resolveEntity(peerId);
  const type = entityType(entity);
  const name = entityTitle(entity);
  const username = (entity as { username?: string | null }).username ?? null;
  const hasPhoto = !!(entity as { photo?: unknown }).photo;
  const isBot =
    entity instanceof Api.User ? !!entity.bot : false;

  let bio: string | null = null;
  try {
    const client = await getTelegramClient();
    if (entity instanceof Api.User) {
      const full = await client.invoke(
        new Api.users.GetFullUser({ id: entity as unknown as Api.TypeInputUser }),
      );
      const about = (full as unknown as { fullUser?: { about?: string } }).fullUser?.about;
      bio = about ?? null;
    } else if (entity instanceof Api.Chat || entity instanceof Api.Channel) {
      const full = await client.invoke(
        new Api.channels.GetFullChannel({
          channel: entity as unknown as Api.TypeInputChannel,
        }),
      );
      const about = (full as unknown as { fullChat?: { about?: string } }).fullChat?.about;
      bio = about ?? null;
    }
  } catch {
    // bio is optional; ignore errors
  }

  return {
    id: bigToString((entity as { id: unknown }).id),
    name,
    username,
    bio,
    phone: entity instanceof Api.User ? (entity.phone ?? null) : null,
    isBot,
    hasPhoto,
    type,
  };
}

export async function markChatRead(
  chatId: string,
  maxId?: number,
): Promise<{ ok: true }> {
  const { entity } = await resolveEntity(chatId);
  const client = await getTelegramClient();
  await client.markAsRead(entity, maxId, { clearMentions: true });
  return { ok: true };
}

export async function sendChatMessage(
  chatId: string,
  text: string,
  replyToMsgId?: number,
  scheduleDate?: number,
): Promise<{ id: number; date: number }> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Message text is empty");
  const { entity } = await resolveEntity(chatId);
  const client = await getTelegramClient();
  const sent = (await client.sendMessage(entity, {
    message: trimmed,
    ...(replyToMsgId ? { replyTo: replyToMsgId } : {}),
    ...(scheduleDate ? { schedule: scheduleDate } : {}),
  })) as Api.Message;
  return { id: sent.id, date: sent.date };
}

export async function sendMediaFile(
  chatId: string,
  buffer: Buffer,
  filename: string,
  caption?: string,
  replyToMsgId?: number,
): Promise<{ id: number; date: number }> {
  const { entity } = await resolveEntity(chatId);
  const client = await getTelegramClient();
  const { CustomFile } = await import("telegram/client/uploads.js");
  const file = new CustomFile(filename, buffer.length, filename, buffer);
  const sent = (await client.sendFile(entity, {
    file,
    caption: caption ?? "",
    ...(replyToMsgId ? { replyTo: replyToMsgId } : {}),
    workers: 1,
  })) as Api.Message;
  return { id: sent.id, date: sent.date };
}

export async function setMessageReaction(
  chatId: string,
  msgId: number,
  emoji: string | null,
): Promise<{ ok: true }> {
  const { entity } = await resolveEntity(chatId);
  const client = await getTelegramClient();
  const reaction = emoji ? [new Api.ReactionEmoji({ emoticon: emoji })] : [];
  await client.invoke(
    new Api.messages.SendReaction({
      peer: entity as unknown as Api.TypeInputPeer,
      msgId,
      reaction,
      big: false,
    }),
  );
  return { ok: true };
}

export async function getProfilePhoto(
  peerId: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const client = await getTelegramClient();
  let entity: unknown;
  try {
    entity = await client.getEntity(peerId);
  } catch {
    try {
      entity = await client.getEntity(bigInt(peerId));
    } catch (err) {
      logger.warn({ err, peerId }, "Could not resolve entity for profile photo");
      return null;
    }
  }

  const buffer = (await client.downloadProfilePhoto(entity as Api.TypeEntityLike, {
    isBig: false,
  })) as Buffer | undefined;
  if (!buffer || buffer.length === 0) return null;
  return { buffer, mimeType: "image/jpeg" };
}

export interface MediaInfo {
  mimeType: string | null;
  fileName: string;
  size: number;
}

export interface OpenedMedia {
  info: MediaInfo;
  fullBuffer?: Buffer;
  streamRange?: (offset: number, length: number) => AsyncIterable<Buffer>;
}

const STREAM_CHUNK_SIZE = 512 * 1024;

export async function openMessageMedia(
  chatId: string,
  messageId: number,
  thumb: boolean,
): Promise<OpenedMedia | null> {
  const { entity } = await resolveEntity(chatId);
  const client = await getTelegramClient();
  const messages = await client.getMessages(entity, { ids: [messageId] });
  const message = messages[0];
  if (!message || !message.media) return null;

  if (thumb) {
    const buffer = (await client.downloadMedia(message, { thumb: 0 })) as Buffer | undefined;
    if (!buffer || buffer.length === 0) return null;
    return {
      info: { mimeType: "image/jpeg", fileName: `thumb_${messageId}.jpg`, size: buffer.length },
      fullBuffer: buffer,
    };
  }

  const media = message.media;

  if (media instanceof Api.MessageMediaPhoto) {
    const buffer = (await client.downloadMedia(message, {})) as Buffer | undefined;
    if (!buffer || buffer.length === 0) return null;
    return {
      info: { mimeType: "image/jpeg", fileName: `photo_${messageId}.jpg`, size: buffer.length },
      fullBuffer: buffer,
    };
  }

  if (media instanceof Api.MessageMediaDocument && media.document instanceof Api.Document) {
    const doc = media.document;
    const mimeType = doc.mimeType ?? null;
    const totalSize = Number(doc.size as unknown as bigint | number);

    const fileAttr = doc.attributes.find(
      (a): a is Api.DocumentAttributeFilename => a instanceof Api.DocumentAttributeFilename,
    );
    const originalName = fileAttr?.fileName ?? null;
    let ext = ".bin";
    if (originalName) {
      const e = path.extname(originalName);
      if (e) ext = e;
    } else if (mimeType === "video/mp4") ext = ".mp4";
    else if (mimeType === "video/webm") ext = ".webm";
    else if (mimeType === "image/webp") ext = ".webp";
    else if (mimeType === "audio/ogg") ext = ".ogg";
    else if (mimeType === "audio/mpeg") ext = ".mp3";
    const fileName = originalName ?? `media_${messageId}${ext}`;

    const fileLocation = new Api.InputDocumentFileLocation({
      id: doc.id,
      accessHash: doc.accessHash,
      fileReference: doc.fileReference,
      thumbSize: "",
    });
    const dcId = doc.dcId;

    return {
      info: { mimeType, fileName, size: totalSize },
      streamRange: async function* (byteOffset: number, byteLength: number) {
        if (byteLength <= 0 || byteOffset >= totalSize) return;
        const end = Math.min(byteOffset + byteLength, totalSize);
        const length = end - byteOffset;

        const alignedOffset = Math.floor(byteOffset / STREAM_CHUNK_SIZE) * STREAM_CHUNK_SIZE;
        const skip = byteOffset - alignedOffset;
        const chunksNeeded = Math.ceil((skip + length) / STREAM_CHUNK_SIZE);

        const iter = client.iterDownload({
          file: fileLocation,
          offset: bigInt(alignedOffset),
          limit: chunksNeeded,
          requestSize: STREAM_CHUNK_SIZE,
          chunkSize: STREAM_CHUNK_SIZE,
          fileSize: bigInt(totalSize),
          dcId,
        });

        let remaining = length;
        let leadingSkip = skip;
        for await (const raw of iter) {
          if (remaining <= 0) break;
          let chunk = raw as Buffer;
          if (leadingSkip > 0) {
            if (leadingSkip >= chunk.length) {
              leadingSkip -= chunk.length;
              continue;
            }
            chunk = chunk.subarray(leadingSkip);
            leadingSkip = 0;
          }
          if (chunk.length > remaining) {
            chunk = chunk.subarray(0, remaining);
          }
          yield chunk;
          remaining -= chunk.length;
        }
      },
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// OG meta-tag fetcher (for link previews)
// ---------------------------------------------------------------------------

export async function fetchOgData(url: string): Promise<{
  title: string | null;
  description: string | null;
  image: string | null;
}> {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TelegramViewer/1.0; +https://github.com)" },
      signal: AbortSignal.timeout(5_000),
      redirect: "follow",
    });
    if (!resp.ok) return { title: null, description: null, image: null };
    const html = await resp.text();

    function getOg(prop: string): string | null {
      const r1 = new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"'<>]+)["']`, "i");
      const r2 = new RegExp(`<meta[^>]+content=["']([^"'<>]+)["'][^>]+property=["']og:${prop}["']`, "i");
      return html.match(r1)?.[1]?.trim() ?? html.match(r2)?.[1]?.trim() ?? null;
    }

    const title =
      getOg("title") ??
      html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1]?.trim() ??
      null;
    const description = getOg("description");
    const image = getOg("image");
    return { title, description, image };
  } catch {
    return { title: null, description: null, image: null };
  }
}

// ---------------------------------------------------------------------------
// Dialog folders (user-created Telegram chat folders)
// ---------------------------------------------------------------------------

export async function getDialogFolders(): Promise<{ id: number; title: string }[]> {
  const client = await getTelegramClient();
  const raw = (await client.invoke(new Api.messages.GetDialogFilters())) as unknown;
  const filters: unknown[] = Array.isArray(raw)
    ? raw
    : ((raw as { filters?: unknown[] }).filters ?? []);

  const out: { id: number; title: string }[] = [];
  for (const f of filters) {
    const folder = f as { id?: number; title?: unknown; className?: string };
    if (!folder.id || folder.className === "DialogFilterDefault") continue;
    const rawTitle = folder.title;
    const title =
      typeof rawTitle === "string"
        ? rawTitle
        : (rawTitle as { text?: string } | undefined)?.text ?? "Folder";
    out.push({ id: folder.id, title });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Global contact / channel / bot search
// ---------------------------------------------------------------------------

export async function searchContacts(q: string, limit = 20): Promise<DialogEntry[]> {
  const client = await getTelegramClient();

  const result = await client.invoke(new Api.contacts.Search({ q, limit }));

  const entityMap = new Map<string, unknown>();
  for (const chat of result.chats) {
    entityMap.set(bigToString((chat as { id: unknown }).id), chat);
  }
  for (const user of result.users) {
    entityMap.set(bigToString((user as { id: unknown }).id), user);
  }

  const out: DialogEntry[] = [];
  const seen = new Set<string>();

  for (const r of [...result.myResults, ...result.results]) {
    let entityId: string;
    if (r instanceof Api.PeerUser) entityId = bigToString(r.userId);
    else if (r instanceof Api.PeerChannel) entityId = bigToString(r.channelId);
    else if (r instanceof Api.PeerChat) entityId = bigToString(r.chatId);
    else continue;

    if (seen.has(entityId)) continue;
    seen.add(entityId);

    const entity = entityMap.get(entityId);
    if (!entity) continue;

    out.push({
      id: bigToString((entity as { id: unknown }).id),
      type: entityType(entity),
      title: entityTitle(entity),
      username: (entity as { username?: string }).username ?? null,
      unreadCount: 0,
      isPinned: false,
      isVerified: (entity as { verified?: boolean }).verified ?? false,
      isBot: entity instanceof Api.User ? (entity.bot ?? false) : false,
      hasPhoto: !!(entity as { photo?: unknown }).photo,
      readInboxMaxId: null,
      readOutboxMaxId: null,
      presence: entity instanceof Api.User ? userPresence(entity) : null,
      lastMessage: null,
    });
  }

  return out;
}
