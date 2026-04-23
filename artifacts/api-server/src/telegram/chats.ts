import { Api } from "telegram";
import bigInt from "big-integer";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { getTelegramClient } from "./client";
import { STORAGE_DIR } from "./videos";
import { logger } from "../lib/logger";

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
  lastMessage: {
    id: number;
    text: string;
    date: number;
    out: boolean;
  } | null;
}

export interface MessageEntry {
  id: number;
  date: number;
  out: boolean;
  text: string;
  fromId: string | null;
  fromName: string | null;
  replyToMsgId: number | null;
  views: number | null;
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

const PHOTO_DIR = path.join(STORAGE_DIR, "photos");
const MEDIA_DIR = path.join(STORAGE_DIR, "media");

async function ensureDirs(): Promise<void> {
  await fs.mkdir(PHOTO_DIR, { recursive: true });
  await fs.mkdir(MEDIA_DIR, { recursive: true });
}

function bigToString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  // big-integer or bigint
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

export async function listDialogs(limit = 100): Promise<DialogEntry[]> {
  const client = await getTelegramClient();
  const dialogs = await client.getDialogs({ limit });

  const out: DialogEntry[] = [];
  for (const d of dialogs) {
    const entity = d.entity;
    if (!entity) continue;
    const type = entityType(entity);
    const title = entityTitle(entity);
    const username =
      (entity as { username?: string | null }).username ?? null;
    const isBot = entity instanceof Api.User && !!entity.bot;
    const isVerified =
      (entity as { verified?: boolean }).verified ?? false;
    const hasPhoto = !!(entity as { photo?: unknown }).photo;

    const lastMessage = d.message
      ? {
          id: d.message.id,
          text: summarizeMessageText(d.message),
          date: d.message.date,
          out: !!d.message.out,
        }
      : null;

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
      lastMessage,
    });
  }
  return out;
}

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
    // fallback: refresh dialogs to populate cache, then retry as bigInt
    await client.getDialogs({ limit: 200 });
    entity = await client.getEntity(bigInt(chatId));
  }
  return {
    entity: entity as Api.TypeEntityLike,
    type: entityType(entity),
    id: bigToString((entity as { id: unknown }).id),
  };
}

function extractMessageMedia(
  msg: Api.Message,
  chatId: string,
  baseUrl: string,
): MessageMedia | null {
  const media = msg.media;
  if (!media) return null;
  const url = `${baseUrl}/api/media/${chatId}/${msg.id}`;

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
        thumbUrl: `${baseUrl}/api/media/${chatId}/${msg.id}?thumb=1`,
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

export async function listMessages(
  chatId: string,
  limit: number,
  offsetId: number | undefined,
  baseUrl: string,
): Promise<{ chatId: string; messages: MessageEntry[] }> {
  const { entity, id: resolvedId } = await resolveEntity(chatId);
  const client = await getTelegramClient();
  const messages = await client.getMessages(entity, {
    limit,
    offsetId: offsetId ?? 0,
  });

  const out: MessageEntry[] = messages.map((m) => {
    const fromIdRaw = (m.fromId ?? m.peerId) as unknown;
    let fromId: string | null = null;
    if (fromIdRaw instanceof Api.PeerUser) fromId = bigToString(fromIdRaw.userId);
    else if (fromIdRaw instanceof Api.PeerChannel) fromId = bigToString(fromIdRaw.channelId);
    else if (fromIdRaw instanceof Api.PeerChat) fromId = bigToString(fromIdRaw.chatId);

    const sender = (m as unknown as { sender?: unknown }).sender;
    const fromName = sender ? entityTitle(sender) : null;

    return {
      id: m.id,
      date: m.date,
      out: !!m.out,
      text: m.message ?? "",
      fromId,
      fromName,
      replyToMsgId:
        m.replyTo instanceof Api.MessageReplyHeader ? m.replyTo.replyToMsgId ?? null : null,
      views: (m as unknown as { views?: number }).views ?? null,
      media: extractMessageMedia(m, resolvedId, baseUrl),
    };
  });

  return { chatId: resolvedId, messages: out };
}

export async function getProfilePhoto(
  peerId: string,
): Promise<{ filePath: string } | null> {
  await ensureDirs();
  const safe = peerId.replace(/[^a-zA-Z0-9_-]/g, "");
  const filePath = path.join(PHOTO_DIR, `${safe}.jpg`);
  if (existsSync(filePath)) return { filePath };

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
  await fs.writeFile(filePath, buffer);
  return { filePath };
}

export async function sendChatMessage(
  chatId: string,
  text: string,
  replyToMsgId?: number,
): Promise<{ id: number; date: number }> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Message text is empty");
  const { entity } = await resolveEntity(chatId);
  const client = await getTelegramClient();
  const sent = (await client.sendMessage(entity, {
    message: trimmed,
    ...(replyToMsgId ? { replyTo: replyToMsgId } : {}),
  })) as Api.Message;
  return { id: sent.id, date: sent.date };
}

export async function getMessageMedia(
  chatId: string,
  messageId: number,
  thumb: boolean,
): Promise<{ filePath: string; mimeType: string | null } | null> {
  await ensureDirs();
  const safeChat = chatId.replace(/[^a-zA-Z0-9_-]/g, "");
  const suffix = thumb ? "_thumb.jpg" : "";

  // Try cached first
  if (thumb) {
    const cached = path.join(MEDIA_DIR, `${safeChat}_${messageId}${suffix}`);
    if (existsSync(cached)) return { filePath: cached, mimeType: "image/jpeg" };
  } else {
    for (const ext of [".jpg", ".jpeg", ".png", ".webp", ".mp4", ".MP4", ".mov", ".webm", ".ogg", ".mp3", ".m4a", ".bin"]) {
      const candidate = path.join(MEDIA_DIR, `${safeChat}_${messageId}${ext}`);
      if (existsSync(candidate)) return { filePath: candidate, mimeType: null };
    }
  }

  const { entity } = await resolveEntity(chatId);
  const client = await getTelegramClient();
  const messages = await client.getMessages(entity, { ids: [messageId] });
  const message = messages[0];
  if (!message || !message.media) return null;

  if (thumb) {
    const buffer = (await client.downloadMedia(message, { thumb: 0 })) as Buffer | undefined;
    if (!buffer) return null;
    const filePath = path.join(MEDIA_DIR, `${safeChat}_${messageId}${suffix}`);
    await fs.writeFile(filePath, buffer);
    return { filePath, mimeType: "image/jpeg" };
  }

  // Determine extension
  const media = message.media;
  let ext = ".bin";
  let mimeType: string | null = null;
  if (media instanceof Api.MessageMediaPhoto) {
    ext = ".jpg";
    mimeType = "image/jpeg";
  } else if (media instanceof Api.MessageMediaDocument && media.document instanceof Api.Document) {
    mimeType = media.document.mimeType ?? null;
    const fileAttr = media.document.attributes.find(
      (a): a is Api.DocumentAttributeFilename => a instanceof Api.DocumentAttributeFilename,
    );
    if (fileAttr?.fileName) {
      const e = path.extname(fileAttr.fileName);
      if (e) ext = e;
    } else if (mimeType === "video/mp4") ext = ".mp4";
    else if (mimeType === "image/webp") ext = ".webp";
    else if (mimeType === "audio/ogg") ext = ".ogg";
    else if (mimeType === "audio/mpeg") ext = ".mp3";
  }

  const filePath = path.join(MEDIA_DIR, `${safeChat}_${messageId}${ext}`);
  logger.info({ chatId, messageId, filePath }, "Downloading media");
  try {
    const buffer = (await client.downloadMedia(message, {})) as Buffer | undefined;
    if (!buffer || buffer.length === 0) {
      logger.warn({ chatId, messageId }, "Empty media download");
      return null;
    }
    await fs.writeFile(filePath, buffer);
    logger.info({ chatId, messageId, size: buffer.length }, "Media downloaded");
    return { filePath, mimeType };
  } catch (err) {
    logger.error({ err, chatId, messageId }, "Media download failed");
    throw err;
  }
}
