/**
 * Registers MTProto update handlers on a TelegramClient and routes them
 * into the per-session SSE bus.
 *
 * Handled update types:
 *   UpdateNewMessage / UpdateNewChannelMessage → new_message
 *   UpdateEditMessage / UpdateEditChannelMessage → edit_message
 *   UpdateDeleteMessages → delete_messages_global
 *   UpdateDeleteChannelMessages → delete_messages (chatId known)
 *   UpdateUserStatus → user_status
 *   UpdateReadHistoryInbox / UpdateReadChannelInbox → read_inbox
 *   UpdateReadHistoryOutbox / UpdateReadChannelOutbox → read_outbox
 *   UpdateUserTyping / UpdateChatUserTyping / UpdateChannelUserTyping → typing
 *   UpdateDraftMessage → dialog_draft
 */

import { TelegramClient, Api } from "telegram";
import { Raw } from "telegram/events/Raw.js";
import { logger } from "../lib/logger";
import { emitToSession } from "./updateBus";
import type { SSEEvent, UserPresenceSummary } from "./updateBus";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function bigStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return (v as { toString(): string }).toString();
}

function peerToChatId(peer: unknown): string {
  if (peer instanceof Api.PeerUser) return bigStr(peer.userId);
  if (peer instanceof Api.PeerChat) return bigStr(peer.chatId);
  if (peer instanceof Api.PeerChannel) return bigStr(peer.channelId);
  return "";
}

function statusToPresence(status: unknown): UserPresenceSummary | null {
  if (!status) return null;
  if (status instanceof Api.UserStatusOnline) return { kind: "online", expires: status.expires };
  if (status instanceof Api.UserStatusOffline) return { kind: "offline", wasOnline: status.wasOnline };
  if (status instanceof Api.UserStatusRecently) return { kind: "recently" };
  if (status instanceof Api.UserStatusLastWeek) return { kind: "lastWeek" };
  if (status instanceof Api.UserStatusLastMonth) return { kind: "lastMonth" };
  return { kind: "longAgo" };
}

function typingActionLabel(action: unknown): string {
  if (action instanceof Api.SendMessageTypingAction) return "typing";
  if (action instanceof Api.SendMessageCancelAction) return "cancel";
  if (action instanceof Api.SendMessageUploadPhotoAction) return "upload_photo";
  if (action instanceof Api.SendMessageUploadVideoAction) return "upload_video";
  if (action instanceof Api.SendMessageRecordVideoAction) return "record_video";
  if (action instanceof Api.SendMessageUploadDocumentAction) return "upload_document";
  if (action instanceof Api.SendMessageRecordAudioAction) return "record_voice";
  if (action instanceof Api.SendMessageUploadAudioAction) return "upload_voice";
  if (action instanceof Api.SendMessageGamePlayAction) return "game";
  return "typing";
}

function entityTitle(entity: unknown): string {
  if (entity instanceof Api.User) {
    const name = `${entity.firstName ?? ""} ${entity.lastName ?? ""}`.trim();
    return name || entity.username || `User ${bigStr(entity.id)}`;
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

// ---------------------------------------------------------------------------
// Build a minimal MessageEntry from a raw Api.Message for SSE delivery.
// We deliberately skip async reply-preview fetching to keep latency near zero;
// the frontend already has the reply preview when loading history.
// ---------------------------------------------------------------------------

function buildSSEMessage(msg: Api.Message, chatId: string): Record<string, unknown> {
  const fromRaw = (msg.fromId ?? msg.peerId) as unknown;
  let fromId: string | null = null;
  if (fromRaw instanceof Api.PeerUser) fromId = bigStr(fromRaw.userId);
  else if (fromRaw instanceof Api.PeerChannel) fromId = bigStr(fromRaw.channelId);
  else if (fromRaw instanceof Api.PeerChat) fromId = bigStr(fromRaw.chatId);

  const sender = (msg as unknown as { sender?: unknown }).sender;
  const fromName = sender ? entityTitle(sender) : null;
  const senderHasPhoto = !!(sender as { photo?: unknown } | undefined)?.photo;

  const replyToMsgId =
    msg.replyTo instanceof Api.MessageReplyHeader ? msg.replyTo.replyToMsgId ?? null : null;

  // ── reactions ──────────────────────────────────────────────────────────
  const rawReactions = (msg as unknown as { reactions?: Api.MessageReactions }).reactions;
  const reactions: Array<{ emoji: string; count: number; chosen: boolean }> = [];
  if (rawReactions?.results) {
    for (const rc of rawReactions.results) {
      if (!(rc instanceof Api.ReactionCount)) continue;
      const r = rc.reaction;
      if (!(r instanceof Api.ReactionEmoji)) continue;
      reactions.push({ emoji: r.emoticon, count: rc.count, chosen: typeof rc.chosenOrder === "number" });
    }
  }

  // ── forward info ────────────────────────────────────────────────────────
  let fwdFrom: { fromName: string | null; date: number } | null = null;
  if (msg.fwdFrom) {
    fwdFrom = { fromName: msg.fwdFrom.fromName ?? null, date: msg.fwdFrom.date };
  }

  // ── media ───────────────────────────────────────────────────────────────
  const media = buildSSEMedia(msg, chatId);

  return {
    id: msg.id,
    date: msg.date,
    editDate: (msg as unknown as { editDate?: number }).editDate ?? null,
    out: !!msg.out,
    text: msg.message ?? "",
    fromId,
    fromName,
    senderHasPhoto,
    replyToMsgId,
    replyTo: null, // fetched lazily by the frontend when needed
    fwdFrom,
    views: (msg as unknown as { views?: number }).views ?? null,
    reactions,
    media,
  };
}

function buildSSEMedia(msg: Api.Message, chatId: string): Record<string, unknown> | null {
  const media = msg.media;
  if (!media) return null;
  const url = `/api/media/${chatId}/${msg.id}`;

  if (media instanceof Api.MessageMediaPhoto) {
    const photo = media.photo;
    let width: number | null = null, height: number | null = null;
    if (photo instanceof Api.Photo) {
      const last = photo.sizes[photo.sizes.length - 1];
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
    const videoAttr = doc.attributes.find((a): a is Api.DocumentAttributeVideo => a instanceof Api.DocumentAttributeVideo);
    const audioAttr = doc.attributes.find((a): a is Api.DocumentAttributeAudio => a instanceof Api.DocumentAttributeAudio);
    const fileAttr = doc.attributes.find((a): a is Api.DocumentAttributeFilename => a instanceof Api.DocumentAttributeFilename);
    const stickerAttr = doc.attributes.find((a): a is Api.DocumentAttributeSticker => a instanceof Api.DocumentAttributeSticker);
    if (videoAttr) {
      return {
        kind: "video",
        width: videoAttr.w ?? null, height: videoAttr.h ?? null,
        duration: videoAttr.duration ?? null, mimeType, size, url,
        thumbUrl: `${url}?thumb=1`,
      };
    }
    if (audioAttr) return { kind: audioAttr.voice ? "voice" : "audio", duration: audioAttr.duration ?? null, mimeType, size, url };
    if (stickerAttr) return { kind: "sticker", url, mimeType };
    return { kind: "document", fileName: fileAttr?.fileName ?? "file", mimeType, size, url };
  }

  if (media instanceof Api.MessageMediaWebPage) {
    const w = media.webpage;
    if (w instanceof Api.WebPage) return { kind: "webpage", title: w.title ?? null, description: w.description ?? null, url: w.url ?? null };
    return { kind: "webpage", title: null, description: null, url: null };
  }

  if (media instanceof Api.MessageMediaContact) return { kind: "other", label: "Contact" };
  if (media instanceof Api.MessageMediaGeo) return { kind: "other", label: "Location" };
  if (media instanceof Api.MessageMediaPoll) return { kind: "other", label: "Poll" };
  return { kind: "other", label: "Unsupported media" };
}

// ---------------------------------------------------------------------------
// Resolve a cached entity name for typing events.
// gramjs caches entities after getDialogs() / getMe() so this is usually fast.
// ---------------------------------------------------------------------------

async function resolveUserName(client: TelegramClient, userId: unknown): Promise<string> {
  try {
    const entity = await client.getEntity(bigStr(userId));
    return entityTitle(entity);
  } catch {
    return `User ${bigStr(userId)}`;
  }
}

// ---------------------------------------------------------------------------
// Main registration function
// ---------------------------------------------------------------------------

export function registerUpdateHandlers(client: TelegramClient, sessionId: string): void {
  // gramjs Raw event — receives every raw MTProto update object
  client.addEventHandler(
    (update: Api.TypeUpdate) => {
      void handleUpdate(update, client, sessionId);
    },
    new Raw({}),
  );

  logger.debug({ sessionId }, "Registered Telegram update handlers");
}

async function handleUpdate(
  update: Api.TypeUpdate,
  client: TelegramClient,
  sessionId: string,
): Promise<void> {
  try {
    // ── New messages ────────────────────────────────────────────────────
    if (
      (update instanceof Api.UpdateNewMessage || update instanceof Api.UpdateNewChannelMessage) &&
      update.message instanceof Api.Message
    ) {
      const msg = update.message;
      const chatId = peerToChatId(msg.peerId);
      if (!chatId) return;
      const message = buildSSEMessage(msg, chatId);
      emitToSession(sessionId, { type: "new_message", chatId, message });
      return;
    }

    // ── Edited messages ─────────────────────────────────────────────────
    if (
      (update instanceof Api.UpdateEditMessage || update instanceof Api.UpdateEditChannelMessage) &&
      update.message instanceof Api.Message
    ) {
      const msg = update.message;
      const chatId = peerToChatId(msg.peerId);
      if (!chatId) return;
      const message = buildSSEMessage(msg, chatId);
      emitToSession(sessionId, { type: "edit_message", chatId, message });
      return;
    }

    // ── Deleted messages (non-channel: global IDs only) ─────────────────
    if (update instanceof Api.UpdateDeleteMessages) {
      const ids = update.messages.map(Number);
      if (ids.length === 0) return;
      emitToSession(sessionId, { type: "delete_messages_global", ids });
      return;
    }

    // ── Deleted channel messages (chatId known) ──────────────────────────
    if (update instanceof Api.UpdateDeleteChannelMessages) {
      const chatId = bigStr(update.channelId);
      const ids = update.messages.map(Number);
      if (!chatId || ids.length === 0) return;
      emitToSession(sessionId, { type: "delete_messages", chatId, ids });
      return;
    }

    // ── User status ─────────────────────────────────────────────────────
    if (update instanceof Api.UpdateUserStatus) {
      const userId = bigStr(update.userId);
      const presence = statusToPresence(update.status);
      emitToSession(sessionId, { type: "user_status", userId, presence });
      return;
    }

    // ── Read inbox (DM / group) ─────────────────────────────────────────
    if (update instanceof Api.UpdateReadHistoryInbox) {
      const chatId = peerToChatId(update.peer);
      if (!chatId) return;
      emitToSession(sessionId, {
        type: "read_inbox",
        chatId,
        maxId: update.maxId,
        stillUnread: (update as unknown as { stillUnreadCount?: number }).stillUnreadCount ?? 0,
      });
      return;
    }

    // ── Read inbox (channel) ────────────────────────────────────────────
    if (update instanceof Api.UpdateReadChannelInbox) {
      const chatId = bigStr(update.channelId);
      if (!chatId) return;
      emitToSession(sessionId, {
        type: "read_inbox",
        chatId,
        maxId: update.maxId,
        stillUnread: update.stillUnreadCount ?? 0,
      });
      return;
    }

    // ── Read outbox (DM / group) ────────────────────────────────────────
    if (update instanceof Api.UpdateReadHistoryOutbox) {
      const chatId = peerToChatId(update.peer);
      if (!chatId) return;
      emitToSession(sessionId, { type: "read_outbox", chatId, maxId: update.maxId });
      return;
    }

    // ── Read outbox (channel) ───────────────────────────────────────────
    if (update instanceof Api.UpdateReadChannelOutbox) {
      const chatId = bigStr(update.channelId);
      if (!chatId) return;
      emitToSession(sessionId, { type: "read_outbox", chatId, maxId: update.maxId });
      return;
    }

    // ── Typing (DM) ──────────────────────────────────────────────────────
    if (update instanceof Api.UpdateUserTyping) {
      const userId = bigStr(update.userId);
      const action = typingActionLabel(update.action);
      const chatId = userId; // in DMs, chatId = userId of the other party
      const userName = await resolveUserName(client, update.userId);
      emitToSession(sessionId, { type: "typing", chatId, userId, userName, action });
      return;
    }

    // ── Typing (group) ────────────────────────────────────────────────────
    if (update instanceof Api.UpdateChatUserTyping) {
      const chatId = bigStr(update.chatId);
      const userId = peerToChatId(update.fromId);
      if (!chatId || !userId) return;
      const action = typingActionLabel(update.action);
      const userName = await resolveUserName(client, (update.fromId as Api.PeerUser)?.userId ?? update.fromId);
      emitToSession(sessionId, { type: "typing", chatId, userId, userName, action });
      return;
    }

    // ── Typing (channel) ─────────────────────────────────────────────────
    if (update instanceof Api.UpdateChannelUserTyping) {
      const chatId = bigStr(update.channelId);
      const userId = peerToChatId(update.fromId);
      if (!chatId || !userId) return;
      const action = typingActionLabel(update.action);
      const userName = await resolveUserName(client, (update.fromId as Api.PeerUser)?.userId ?? update.fromId);
      emitToSession(sessionId, { type: "typing", chatId, userId, userName, action });
      return;
    }

    // ── Draft updated ────────────────────────────────────────────────────
    if (update instanceof Api.UpdateDraftMessage) {
      const chatId = peerToChatId(update.peer);
      const draft = update.draft;
      const text = draft instanceof Api.DraftMessage ? draft.message ?? "" : "";
      if (!chatId) return;
      emitToSession(sessionId, { type: "dialog_draft", chatId, text });
    }
  } catch (err) {
    logger.warn({ err, sessionId, updateClass: (update as { className?: string }).className }, "Update handler error");
  }
}
