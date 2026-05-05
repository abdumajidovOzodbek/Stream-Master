const _SESSION_KEY = "tg_session_id";
const _COOKIE_MAX_AGE = 365 * 24 * 60 * 60;
function getSessionId(): string {
  try {
    const stored = localStorage.getItem(_SESSION_KEY);
    if (stored && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stored)) {
      document.cookie = `${_SESSION_KEY}=${stored}; Path=/; Max-Age=${_COOKIE_MAX_AGE}; SameSite=Lax`;
      return stored;
    }
    const fresh = crypto.randomUUID();
    localStorage.setItem(_SESSION_KEY, fresh);
    document.cookie = `${_SESSION_KEY}=${fresh}; Path=/; Max-Age=${_COOKIE_MAX_AGE}; SameSite=Lax`;
    return fresh;
  } catch {
    return "00000000-0000-0000-0000-000000000000";
  }
}

export interface Me {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  phone: string | null;
}

export type UserPresence =
  | { kind: "online"; expires: number }
  | { kind: "offline"; wasOnline: number }
  | { kind: "recently" }
  | { kind: "lastWeek" }
  | { kind: "lastMonth" }
  | { kind: "longAgo" };

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

export type MessageMedia =
  | { kind: "photo"; width: number | null; height: number | null; url: string }
  | { kind: "video"; width: number | null; height: number | null; duration: number | null; mimeType: string | null; size: number | null; url: string; thumbUrl: string | null }
  | { kind: "document"; fileName: string; mimeType: string | null; size: number | null; url: string }
  | { kind: "audio" | "voice"; duration: number | null; mimeType: string | null; size: number | null; url: string }
  | { kind: "sticker"; url: string; mimeType: string | null }
  | { kind: "webpage"; title: string | null; description: string | null; url: string | null }
  | { kind: "other"; label: string };

export interface Reaction {
  emoji: string;
  count: number;
  chosen: boolean;
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

export interface PollOption {
  text: string;
  voters: number;
  chosen: boolean;
}

export interface PollInfo {
  question: string;
  options: PollOption[];
  totalVoters: number;
  closed: boolean;
  multipleChoice: boolean;
  quiz: boolean;
}

export interface BotCommand {
  command: string;
  description: string;
}

export interface SubscriberEntry {
  id: string;
  name: string;
  username: string | null;
  hasPhoto: boolean;
  isBot: boolean;
  role: "creator" | "admin" | "member";
}

export interface Message {
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
  groupedId: string | null;
  pinned: boolean;
  poll: PollInfo | null;
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
  participantsCount: number | null;
}

export interface AdminSession {
  sessionId: string;
  phone: string | null;
  userId: string | null;
  firstName: string | null;
  username: string | null;
  lastSeen: number;
}

// ---------------------------------------------------------------------------
// Fetch helpers — all include X-Session-ID
// ---------------------------------------------------------------------------

function sessionHeaders(): Record<string, string> {
  return { "X-Session-ID": getSessionId() };
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: sessionHeaders() });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
    throw new Error(body.detail || body.error || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...sessionHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
    throw new Error(body.detail || body.error || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

export const api = {
  me: () => get<Me>("/api/me"),

  dialogs: (limit = 100) =>
    get<{ count: number; dialogs: Dialog[] }>(`/api/dialogs?limit=${limit}`),

  messages: (chatId: string, limit = 50, offsetId?: number) => {
    const p = new URLSearchParams({ chatId, limit: String(limit) });
    if (offsetId) p.set("offsetId", String(offsetId));
    return get<{ chatId: string; messages: Message[] }>(`/api/messages?${p}`);
  },

  searchMessages: (chatId: string, q: string, limit = 20) => {
    const p = new URLSearchParams({ chatId, q, limit: String(limit) });
    return get<{ chatId: string; messages: Message[] }>(`/api/search?${p}`);
  },

  getUserInfo: (peerId: string) =>
    get<UserInfo>(`/api/users/${encodeURIComponent(peerId)}`),

  photoUrl: (peerId: string) => `/api/photo/${encodeURIComponent(peerId)}`,

  sendMessage: (chatId: string, text: string, replyToMsgId?: number, scheduleDate?: number) =>
    postJson<{ id: number; date: number }>("/api/messages", {
      chatId,
      text,
      ...(replyToMsgId ? { replyToMsgId } : {}),
      ...(scheduleDate ? { scheduleDate } : {}),
    }),

  sendMedia: (chatId: string, file: File, caption?: string, replyToMsgId?: number) => {
    const fd = new FormData();
    fd.append("chatId", chatId);
    fd.append("file", file);
    if (caption) fd.append("caption", caption);
    if (replyToMsgId) fd.append("replyToMsgId", String(replyToMsgId));
    return fetch("/api/media", {
      method: "POST",
      headers: sessionHeaders(),
      body: fd,
    }).then(async (r) => {
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      return r.json() as Promise<{ id: number; date: number }>;
    });
  },

  setReaction: (chatId: string, msgId: number, emoji: string | null) =>
    postJson<{ ok: true }>(`/api/reactions/${encodeURIComponent(chatId)}/${msgId}`, { emoji }),

  /**
   * Send a typing action to Telegram.
   * action: "typing" | "cancel" | "upload_photo" | "upload_video" | "upload_document" | "record_voice"
   * Fire-and-forget — errors are silently swallowed since typing is non-critical.
   */
  setTyping: (chatId: string, action: "typing" | "cancel"): void => {
    void postJson<{ ok: true }>("/api/typing", { chatId, action }).catch(() => undefined);
  },

  markRead: (chatId: string, maxId?: number) =>
    postJson<{ ok: true }>(
      `/api/dialogs/${encodeURIComponent(chatId)}/read`,
      maxId != null ? { maxId } : {},
    ),

  searchContacts: (q: string, limit = 20) =>
    get<Dialog[]>(`/api/contacts/search?q=${encodeURIComponent(q)}&limit=${limit}`),

  ogData: (url: string) =>
    get<{ title: string | null; description: string | null; image: string | null }>(
      `/api/og?url=${encodeURIComponent(url)}`,
    ),

  folders: () => get<{ id: number; title: string }[]>("/api/folders"),

  authStatus: () => get<{ authenticated: boolean; me?: Me; impersonating?: boolean }>("/api/auth/status"),

  sendCode: (phone: string) =>
    postJson<{ phoneCodeHash: string; isCodeViaApp: boolean }>("/api/auth/send-code", { phone }),

  signIn: (params: { phone: string; phoneCodeHash: string; code: string; password?: string }) =>
    postJson<{ ok: boolean; needsPassword?: boolean }>("/api/auth/sign-in", params),

  logout: () => postJson<{ ok: true }>("/api/auth/logout", {}),

  qrStart: () => postJson<{ ok: true }>("/api/auth/qr/start", {}),

  qrPassword: (password: string) =>
    postJson<{ ok: true }>("/api/auth/qr/password", { password }),

  qrCancel: () => postJson<{ ok: true }>("/api/auth/qr/cancel", {}),

  getSessionId: () => getSessionId(),

  chatStats: (chatId: string, limit = 500) =>
    get<ChatStats>(`/api/stats/${encodeURIComponent(chatId)}?limit=${limit}`),

  editMessage: (chatId: string, msgId: number, text: string) =>
    fetch(`/api/messages/${encodeURIComponent(chatId)}/${msgId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...sessionHeaders() },
      body: JSON.stringify({ text }),
    }).then(async (r) => {
      if (!r.ok) { const b = (await r.json().catch(() => ({}))) as { error?: string }; throw new Error(b.error ?? `HTTP ${r.status}`); }
      return r.json() as Promise<{ ok: true }>;
    }),

  deleteMessage: (chatId: string, msgId: number) =>
    fetch(`/api/messages/${encodeURIComponent(chatId)}/${msgId}`, {
      method: "DELETE",
      headers: sessionHeaders(),
    }).then(async (r) => {
      if (!r.ok) { const b = (await r.json().catch(() => ({}))) as { error?: string }; throw new Error(b.error ?? `HTTP ${r.status}`); }
      return r.json() as Promise<{ ok: true }>;
    }),

  forwardMessage: (fromChatId: string, toChatId: string, msgIds: number[]) =>
    postJson<{ ok: true }>("/api/messages/forward", { fromChatId, toChatId, msgIds }),

  pinMessage: (chatId: string, msgId: number, unpin = false) =>
    postJson<{ ok: true }>(`/api/messages/${encodeURIComponent(chatId)}/${msgId}/pin`, { unpin }),

  pinnedMessages: (chatId: string) =>
    get<Message[]>(`/api/chats/${encodeURIComponent(chatId)}/pinned`),

  votePoll: (chatId: string, msgId: number, optionIndex: number) =>
    postJson<{ ok: true }>(`/api/messages/${encodeURIComponent(chatId)}/${msgId}/vote`, { optionIndex }),

  globalSearch: (q: string, limit = 20) =>
    get<{ chatId: string; messages: Message[] }[]>(`/api/search/global?q=${encodeURIComponent(q)}&limit=${limit}`),

  archivedDialogs: (limit = 100) =>
    get<{ count: number; dialogs: Dialog[] }>(`/api/dialogs/archived?limit=${limit}`),

  messageNearDate: (chatId: string, ts: number) =>
    get<{ msgId: number | null }>(`/api/messages/${encodeURIComponent(chatId)}/near-date?ts=${ts}`),

  muteChat: (chatId: string, mute: boolean) =>
    postJson<{ ok: true }>(`/api/chats/${encodeURIComponent(chatId)}/mute`, { mute }),

  joinChat: (chatId: string) =>
    postJson<{ ok: true }>(`/api/chats/${encodeURIComponent(chatId)}/join`, {}),

  leaveChat: (chatId: string) =>
    postJson<{ ok: true }>(`/api/chats/${encodeURIComponent(chatId)}/leave`, {}),

  botCommands: (chatId: string) =>
    get<BotCommand[]>(`/api/chats/${encodeURIComponent(chatId)}/commands`),

  subscribers: (chatId: string, limit = 100, offset = 0, q = "") => {
    const p = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (q) p.set("q", q);
    return get<{ subscribers: SubscriberEntry[]; total: number; broadcastOnly: boolean }>(
      `/api/chats/${encodeURIComponent(chatId)}/subscribers?${p}`,
    );
  },
};

// ---------------------------------------------------------------------------
// Settings API
// ---------------------------------------------------------------------------

export type PrivacyValue = "everyone" | "contacts" | "nobody";
export type PrivacyKey = "lastSeen" | "profilePhoto" | "phone" | "forwards" | "calls";

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

export interface ChatStats {
  totalMessages: number;
  dateRange: { first: number; last: number } | null;
  participants: {
    id: string;
    name: string;
    count: number;
    percentage: number;
    avgLength: number;
  }[];
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

export interface TwoFAStatus {
  hasPassword: boolean;
  hint: string;
  emailUnconfirmedPattern: string | null;
}

export const settingsApi = {
  getProfile: () => get<ProfileInfo>("/api/settings/profile"),

  updateProfile: (data: { firstName?: string; lastName?: string; bio?: string }) =>
    postJson<{ ok: true }>("/api/settings/profile", data),

  updateUsername: (username: string) =>
    postJson<{ ok: true }>("/api/settings/profile/username", { username }),

  uploadPhoto: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch("/api/settings/profile/photo", {
      method: "POST",
      headers: sessionHeaders(),
      body: fd,
    }).then(async (r) => {
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      return r.json() as Promise<{ ok: true }>;
    });
  },

  getPrivacy: () => get<PrivacySettings>("/api/settings/privacy"),

  setPrivacy: (key: PrivacyKey, value: PrivacyValue) =>
    postJson<{ ok: true }>("/api/settings/privacy", { key, value }),

  getSessions: () => get<{ sessions: SessionInfo[] }>("/api/settings/sessions"),

  terminateSession: (hash: string) =>
    postJson<{ ok: true }>(`/api/settings/sessions/${encodeURIComponent(hash)}/terminate`, {}),

  terminateAllOtherSessions: () =>
    postJson<{ ok: true }>("/api/settings/sessions/terminate-others", {}),

  getBlocked: () => get<{ users: BlockedUser[] }>("/api/settings/blocked"),

  unblock: (peerId: string) =>
    postJson<{ ok: true }>(`/api/settings/blocked/${encodeURIComponent(peerId)}/unblock`, {}),

  get2FA: () => get<TwoFAStatus>("/api/settings/2fa"),
};

// ---------------------------------------------------------------------------
// Admin API
// ---------------------------------------------------------------------------

function adminHeaders(secret: string): Record<string, string> {
  return { "X-Admin-Secret": secret };
}

export const adminApi = {
  verify: (secret: string) =>
    fetch("/api/admin/verify", {
      method: "POST",
      headers: { ...adminHeaders(secret), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }).then((r) => r.json()) as Promise<{ ok?: boolean; error?: string }>,

  sessions: (secret: string) =>
    fetch("/api/admin/sessions", {
      headers: adminHeaders(secret),
    }).then(async (r) => {
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      return r.json() as Promise<{ sessions: AdminSession[] }>;
    }),

  impersonate: (secret: string, targetSessionId: string) =>
    fetch("/api/admin/impersonate", {
      method: "POST",
      headers: { ...adminHeaders(secret), "Content-Type": "application/json" },
      body: JSON.stringify({ targetSessionId }),
    }).then(async (r) => {
      const body = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
      return body;
    }),

  stopImpersonate: (secret: string) =>
    fetch("/api/admin/stop-impersonate", {
      method: "POST",
      headers: { ...adminHeaders(secret), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }).then((r) => r.json()) as Promise<{ ok?: boolean }>,

  impersonateStatus: (secret: string) =>
    fetch("/api/admin/impersonate-status", {
      headers: adminHeaders(secret),
    }).then((r) => r.json()) as Promise<{ impersonating: string | null; ownSession: string | null }>,
};
