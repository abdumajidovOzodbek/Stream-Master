import { Api, TelegramClient } from "telegram";
import { resolveEntityPublic } from "./chats";

const STOP_WORDS = new Set([
  "the","a","an","and","or","but","in","on","at","to","for","of","with","by",
  "is","it","this","that","was","are","be","as","i","you","he","she","we",
  "they","me","him","her","us","them","my","your","his","its","our","their",
  "do","did","does","will","would","could","should","have","has","had","been",
  "being","not","no","so","if","can","just","more","also","up","out","about",
  "from","get","than","then","there","what","when","where","who","which","how",
  "all","some","one","two","time","dont","im","its","ill","thats","youre",
  "ive","hes","shes","theyre","weve","isnt","arent","wasnt","werent","didnt",
  "doesnt","dont","cant","wont","shouldnt","wouldnt","couldnt","hadnt",
  "hasnt","havent","ok","yes","no","yeah","hey","hi","bye","oh","ah","um",
]);

export interface ParticipantStat {
  id: string;
  name: string;
  count: number;
  percentage: number;
  avgLength: number;
}

export interface ChatStats {
  totalMessages: number;
  dateRange: { first: number; last: number } | null;
  participants: ParticipantStat[];
  hourly: number[];
  weekday: number[];
  mediaTypes: {
    text: number;
    photos: number;
    videos: number;
    voice: number;
    stickers: number;
    files: number;
    other: number;
  };
  topWords: { word: string; count: number }[];
  averageMessageLength: number;
  mostActiveDay: string | null;
  mostActiveDayCount: number;
  analyzedCount: number;
}

export async function getChatStats(
  client: TelegramClient,
  chatId: string,
  limit: number,
): Promise<ChatStats> {
  const { entity } = await resolveEntityPublic(client, chatId);
  const messages = await client.getMessages(entity, { limit });

  const hourly = new Array<number>(24).fill(0);
  const weekday = new Array<number>(7).fill(0);
  const participantMap = new Map<string, { name: string; count: number; totalLength: number }>();
  const dayMap = new Map<string, number>();
  const wordCounts = new Map<string, number>();
  const mediaTypes = { text: 0, photos: 0, videos: 0, voice: 0, stickers: 0, files: 0, other: 0 };

  let firstDate: number | null = null;
  let lastDate: number | null = null;
  let totalTextLength = 0;
  let textMsgCount = 0;

  for (const msg of messages) {
    if (!(msg instanceof Api.Message)) continue;

    const date = msg.date;
    if (!firstDate || date < firstDate) firstDate = date;
    if (!lastDate || date > lastDate) lastDate = date;

    const d = new Date(date * 1000);
    hourly[d.getHours()]++;
    weekday[(d.getDay() + 6) % 7]++;

    const dayKey = d.toISOString().slice(0, 10);
    dayMap.set(dayKey, (dayMap.get(dayKey) ?? 0) + 1);

    let senderId = "unknown";
    let senderName = "Unknown";
    if (msg.senderId) {
      senderId = String(msg.senderId);
    }
    const sender = (msg as unknown as { sender?: unknown }).sender;
    if (sender && typeof sender === "object") {
      const s = sender as Record<string, unknown>;
      const parts = [s["firstName"], s["lastName"]].filter(Boolean);
      senderName = parts.length ? parts.join(" ") as string : (s["username"] as string | undefined) ?? (s["title"] as string | undefined) ?? "Unknown";
    }

    const entry = participantMap.get(senderId) ?? { name: senderName, count: 0, totalLength: 0 };
    entry.count++;

    const media = msg.media;
    if (!media && msg.message) {
      mediaTypes.text++;
      const len = msg.message.length;
      entry.totalLength += len;
      totalTextLength += len;
      textMsgCount++;
      const words = msg.message.toLowerCase().match(/\b[a-z\u00c0-\u024f]{3,}\b/g) ?? [];
      for (const w of words) {
        if (!STOP_WORDS.has(w)) {
          wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);
        }
      }
    } else if (media instanceof Api.MessageMediaPhoto) {
      mediaTypes.photos++;
    } else if (media instanceof Api.MessageMediaDocument) {
      const doc = media.document;
      if (doc instanceof Api.Document) {
        if (doc.attributes.some((a) => a instanceof Api.DocumentAttributeAudio && a.voice)) {
          mediaTypes.voice++;
        } else if (doc.attributes.some((a) => a instanceof Api.DocumentAttributeSticker)) {
          mediaTypes.stickers++;
        } else if (doc.attributes.some((a) => a instanceof Api.DocumentAttributeVideo)) {
          mediaTypes.videos++;
        } else {
          mediaTypes.files++;
        }
      } else {
        mediaTypes.other++;
      }
    } else if (media) {
      mediaTypes.other++;
    }

    participantMap.set(senderId, entry);
  }

  const analyzedCount = messages.filter((m) => m instanceof Api.Message).length;

  const participants: ParticipantStat[] = [...participantMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([id, { name, count, totalLength }]) => ({
      id,
      name,
      count,
      percentage: analyzedCount > 0 ? Math.round((count / analyzedCount) * 100) : 0,
      avgLength: count > 0 ? Math.round(totalLength / count) : 0,
    }));

  const topWords = [...wordCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word, count]) => ({ word, count }));

  let mostActiveDay: string | null = null;
  let mostActiveDayCount = 0;
  for (const [day, count] of dayMap) {
    if (count > mostActiveDayCount) {
      mostActiveDayCount = count;
      mostActiveDay = day;
    }
  }

  return {
    totalMessages: analyzedCount,
    dateRange: firstDate && lastDate ? { first: firstDate, last: lastDate } : null,
    participants,
    hourly,
    weekday,
    mediaTypes,
    topWords,
    averageMessageLength: textMsgCount > 0 ? Math.round(totalTextLength / textMsgCount) : 0,
    mostActiveDay,
    mostActiveDayCount,
    analyzedCount,
  };
}
