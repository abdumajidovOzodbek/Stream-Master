export interface Me {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  phone: string | null;
}

export interface Dialog {
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

export type MessageMedia =
  | { kind: "photo"; width: number | null; height: number | null; url: string }
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
  | { kind: "sticker"; url: string; mimeType: string | null }
  | {
      kind: "webpage";
      title: string | null;
      description: string | null;
      url: string | null;
    }
  | { kind: "other"; label: string };

export interface Message {
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

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      detail?: string;
    };
    throw new Error(body.detail || body.error || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export const api = {
  me: () => get<Me>("/api/me"),
  dialogs: (limit = 100) =>
    get<{ count: number; dialogs: Dialog[] }>(`/api/dialogs?limit=${limit}`),
  messages: (chatId: string, limit = 50, offsetId?: number) => {
    const p = new URLSearchParams({ chatId, limit: String(limit) });
    if (offsetId) p.set("offsetId", String(offsetId));
    return get<{ chatId: string; messages: Message[] }>(`/api/messages?${p}`);
  },
  photoUrl: (peerId: string) => `/api/photo/${encodeURIComponent(peerId)}`,
};
