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
  /** Highest message ID our user has read in this chat. */
  readInboxMaxId: number | null;
  /** Highest message ID of ours that the other side has read. */
  readOutboxMaxId: number | null;
  /** Presence info for user chats. Null for groups/channels. */
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
  replyToMsgId: number | null;
  replyTo: ReplyPreview | null;
  fwdFrom: ForwardInfo | null;
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

// Profile photos and message media are streamed directly from Telegram to the
// HTTP response without ever touching the server filesystem. No PHOTO_DIR or
// MEDIA_DIR — nothing is persisted server-side for user media.

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
): MessageMedia | null {
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
  // Note: fromId resolution to a name would require an additional lookup; we
  // include the human-readable fromName when Telegram provides one.
  return { fromName, date: f.date };
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
      logger.warn(
        { err, chatId: resolvedId },
        "Failed to fetch reply previews",
      );
    }
  }

  const out: MessageEntry[] = messages.map((m) => {
    const fromIdRaw = (m.fromId ?? m.peerId) as unknown;
    let fromId: string | null = null;
    if (fromIdRaw instanceof Api.PeerUser) fromId = bigToString(fromIdRaw.userId);
    else if (fromIdRaw instanceof Api.PeerChannel) fromId = bigToString(fromIdRaw.channelId);
    else if (fromIdRaw instanceof Api.PeerChat) fromId = bigToString(fromIdRaw.chatId);

    const sender = (m as unknown as { sender?: unknown }).sender;
    const fromName = sender ? entityTitle(sender) : null;

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
      replyToMsgId,
      replyTo,
      fwdFrom: fwdFromInfo(m),
      views: (m as unknown as { views?: number }).views ?? null,
      media: extractMessageMedia(m, resolvedId),
    };
  });

  return { chatId: resolvedId, messages: out };
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

export interface MediaInfo {
  mimeType: string | null;
  fileName: string;
  size: number;
}

export interface OpenedMedia {
  info: MediaInfo;
  /** When set, the media is small and already fully buffered (photos, thumbs). */
  fullBuffer?: Buffer;
  /** When set, the media is a Document that can be streamed by byte range. */
  streamRange?: (offset: number, length: number) => AsyncIterable<Buffer>;
}

const STREAM_CHUNK_SIZE = 512 * 1024; // 512 KB — must be a power of 2 ≤ 1MB

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

  // Thumbnails are tiny — just buffer them.
  if (thumb) {
    const buffer = (await client.downloadMedia(message, { thumb: 0 })) as Buffer | undefined;
    if (!buffer || buffer.length === 0) return null;
    return {
      info: {
        mimeType: "image/jpeg",
        fileName: `thumb_${messageId}.jpg`,
        size: buffer.length,
      },
      fullBuffer: buffer,
    };
  }

  const media = message.media;

  // Photos are small — just buffer them.
  if (media instanceof Api.MessageMediaPhoto) {
    const buffer = (await client.downloadMedia(message, {})) as Buffer | undefined;
    if (!buffer || buffer.length === 0) return null;
    return {
      info: {
        mimeType: "image/jpeg",
        fileName: `photo_${messageId}.jpg`,
        size: buffer.length,
      },
      fullBuffer: buffer,
    };
  }

  // Documents (videos, audio, files) — stream by byte range.
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

        // Telegram requires the request offset to be aligned to the chunk size.
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
