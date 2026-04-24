import { Api } from "telegram";
import path from "node:path";
import { getTelegramClient } from "./client";
import { logger } from "../lib/logger";

// Channel videos are streamed directly from Telegram to the client. Nothing is
// persisted on the server filesystem.

export interface VideoMetadata {
  messageId: number;
  fileSize: number | null;
  duration: number | null;
  mimeType: string | null;
  fileName: string;
  date: number;
  caption: string | null;
}

export interface VideoEntry extends VideoMetadata {
  url: string;
  telegramUrl: string;
  downloaded: boolean;
}

function extractVideoMeta(message: Api.Message): VideoMetadata | null {
  const media = message.media;
  if (!media || !(media instanceof Api.MessageMediaDocument)) return null;
  const doc = media.document;
  if (!doc || !(doc instanceof Api.Document)) return null;

  const isVideo =
    doc.mimeType?.startsWith("video/") ||
    doc.attributes.some((a) => a instanceof Api.DocumentAttributeVideo);
  if (!isVideo) return null;

  const videoAttr = doc.attributes.find(
    (a): a is Api.DocumentAttributeVideo => a instanceof Api.DocumentAttributeVideo,
  );
  const fileNameAttr = doc.attributes.find(
    (a): a is Api.DocumentAttributeFilename => a instanceof Api.DocumentAttributeFilename,
  );

  const ext = (() => {
    if (fileNameAttr?.fileName) {
      const e = path.extname(fileNameAttr.fileName);
      if (e) return e;
    }
    if (doc.mimeType === "video/mp4") return ".mp4";
    if (doc.mimeType === "video/webm") return ".webm";
    if (doc.mimeType === "video/quicktime") return ".mov";
    return ".mp4";
  })();

  const fileName = `${message.id}${ext}`;

  return {
    messageId: message.id,
    fileSize: doc.size != null ? Number(doc.size as unknown as bigint | number) : null,
    duration: videoAttr?.duration ?? null,
    mimeType: doc.mimeType ?? null,
    fileName,
    date: message.date,
    caption: message.message || null,
  };
}

export async function listChannelVideos(
  channel: string,
  limit = 50,
): Promise<VideoMetadata[]> {
  const client = await getTelegramClient();
  const entity = await client.getEntity(channel);
  const messages = await client.getMessages(entity, { limit });

  const videos: VideoMetadata[] = [];
  for (const msg of messages) {
    const meta = extractVideoMeta(msg);
    if (meta) videos.push(meta);
  }
  return videos;
}

export interface VideoStream {
  buffer: Buffer;
  mimeType: string | null;
  fileName: string;
  meta: VideoMetadata;
}

export async function streamChannelVideo(
  channel: string,
  messageId: number,
): Promise<VideoStream | null> {
  const client = await getTelegramClient();
  const entity = await client.getEntity(channel);
  const messages = await client.getMessages(entity, { ids: [messageId] });
  const message = messages[0];
  if (!message) return null;

  const meta = extractVideoMeta(message);
  if (!meta) return null;

  logger.info({ messageId, fileName: meta.fileName }, "Streaming video from Telegram");
  const buffer = (await client.downloadMedia(message, {})) as Buffer | undefined;
  if (!buffer || buffer.length === 0) return null;

  return {
    buffer,
    mimeType: meta.mimeType,
    fileName: meta.fileName,
    meta,
  };
}
