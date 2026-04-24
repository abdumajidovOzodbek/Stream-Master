import { Api } from "telegram";
import bigInt from "big-integer";
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

export interface OpenedVideo {
  meta: VideoMetadata;
  fileName: string;
  mimeType: string | null;
  size: number;
  streamRange: (offset: number, length: number) => AsyncIterable<Buffer>;
}

const STREAM_CHUNK_SIZE = 512 * 1024; // 512 KB — power of 2, ≤ 1MB

export async function openChannelVideo(
  channel: string,
  messageId: number,
): Promise<OpenedVideo | null> {
  const client = await getTelegramClient();
  const entity = await client.getEntity(channel);
  const messages = await client.getMessages(entity, { ids: [messageId] });
  const message = messages[0];
  if (!message) return null;

  const meta = extractVideoMeta(message);
  if (!meta) return null;

  const media = message.media;
  if (!(media instanceof Api.MessageMediaDocument) || !(media.document instanceof Api.Document)) {
    return null;
  }
  const doc = media.document;
  const totalSize = Number(doc.size as unknown as bigint | number);
  if (!totalSize) return null;

  const fileLocation = new Api.InputDocumentFileLocation({
    id: doc.id,
    accessHash: doc.accessHash,
    fileReference: doc.fileReference,
    thumbSize: "",
  });
  const dcId = doc.dcId;

  logger.info({ messageId, fileName: meta.fileName, size: totalSize }, "Opened channel video for streaming");

  return {
    meta,
    fileName: meta.fileName,
    mimeType: meta.mimeType,
    size: totalSize,
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
        if (chunk.length > remaining) chunk = chunk.subarray(0, remaining);
        yield chunk;
        remaining -= chunk.length;
      }
    },
  };
}
