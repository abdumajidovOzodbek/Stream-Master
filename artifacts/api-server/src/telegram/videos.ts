import { Api } from "telegram";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { getTelegramClient } from "./client";
import { logger } from "../lib/logger";

export const STORAGE_DIR: string = path.resolve(process.cwd(), "storage");

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

async function ensureStorageDir(): Promise<void> {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
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

export async function downloadVideo(
  channel: string,
  messageId: number,
): Promise<{ filePath: string; meta: VideoMetadata } | null> {
  await ensureStorageDir();
  const client = await getTelegramClient();
  const entity = await client.getEntity(channel);
  const messages = await client.getMessages(entity, { ids: [messageId] });
  const message = messages[0];
  if (!message) return null;

  const meta = extractVideoMeta(message);
  if (!meta) return null;

  const filePath = path.join(STORAGE_DIR, meta.fileName);
  if (existsSync(filePath)) {
    logger.info({ filePath }, "Video already downloaded, skipping");
    return { filePath, meta };
  }

  logger.info({ messageId, fileName: meta.fileName }, "Downloading video");
  const buffer = await client.downloadMedia(message, {});
  if (!buffer) return null;

  await fs.writeFile(filePath, buffer as Buffer);
  logger.info({ filePath, size: (buffer as Buffer).length }, "Video downloaded");
  return { filePath, meta };
}

export async function fetchAndPrepareChannelVideos(
  channel: string,
  baseUrl: string,
  limit = 20,
  download = false,
): Promise<VideoEntry[]> {
  await ensureStorageDir();
  const metas = await listChannelVideos(channel, limit);
  const entries: VideoEntry[] = [];
  const channelHandle = channel.replace(/^@/, "");

  for (const meta of metas) {
    const filePath = path.join(STORAGE_DIR, meta.fileName);
    let downloaded = existsSync(filePath);

    if (download && !downloaded) {
      try {
        const result = await downloadVideo(channel, meta.messageId);
        downloaded = !!result;
      } catch (err) {
        logger.error({ err, messageId: meta.messageId }, "Failed to download video");
      }
    }

    entries.push({
      ...meta,
      telegramUrl: `https://t.me/${channelHandle}/${meta.messageId}`,
      url: `${baseUrl}/api/videos/${meta.fileName}`,
      downloaded,
    });
  }

  return entries;
}
