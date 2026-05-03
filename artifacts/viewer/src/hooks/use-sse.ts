/**
 * useSSE — subscribes to the server's /api/updates SSE stream.
 *
 * Translates each event into React Query cache mutations so components
 * re-render immediately without a round-trip fetch. Also feeds typing
 * indicator state via the typingStore module.
 *
 * Reconnection strategy: exponential backoff (1 s → 2 s → … → 30 s).
 * SSE auto-reconnects natively, but we implement our own so we can reset
 * the retry counter after a successful connection.
 *
 * Mount this hook inside ChatApp (i.e. only when authenticated).
 */

import { useEffect, useRef } from "react";
import { useQueryClient, type QueryClient, type InfiniteData } from "@tanstack/react-query";
import type { Dialog, Message } from "@/lib/api";
import { setTypingUser } from "@/lib/typingStore";

const SESSION_KEY = "tg_session_id";

// ---------------------------------------------------------------------------
// SSE event type definitions (mirrors updateBus.ts on the backend)
// ---------------------------------------------------------------------------

type SSEEvent =
  | { type: "ping" | "connected" }
  | { type: "new_message"; chatId: string; message: Message }
  | { type: "edit_message"; chatId: string; message: Message }
  | { type: "delete_messages"; chatId: string; ids: number[] }
  | { type: "delete_messages_global"; ids: number[] }
  | { type: "user_status"; userId: string; presence: Dialog["presence"] }
  | { type: "read_inbox"; chatId: string; maxId: number; stillUnread: number }
  | { type: "read_outbox"; chatId: string; maxId: number }
  | { type: "typing"; chatId: string; userId: string; userName: string; action: string }
  | { type: "dialog_draft"; chatId: string; text: string };

type MessagePage = { chatId: string; messages: Message[] };
type MessagesData = InfiniteData<MessagePage>;
type DialogsData = { count: number; dialogs: Dialog[] };

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

/** Find the dialog type from the dialogs cache — needed to build message query keys. */
function dialogType(qc: QueryClient, chatId: string): Dialog["type"] | null {
  return (
    qc.getQueryData<DialogsData>(["dialogs"])?.dialogs.find((d) => d.id === chatId)?.type ?? null
  );
}

/** Apply an updater to every loaded message page for a chatId. */
function mutateMsgPages(
  qc: QueryClient,
  chatId: string,
  updater: (msgs: Message[]) => Message[],
) {
  for (const [key, data] of qc.getQueriesData<MessagesData>({ queryKey: ["messages", chatId] })) {
    if (!data) continue;
    qc.setQueryData<MessagesData>(key, {
      ...data,
      pages: data.pages.map((p) => ({ ...p, messages: updater(p.messages) })),
    });
  }
}

function summarizeMedia(m: Message): string {
  if (!m.media) return "";
  switch (m.media.kind) {
    case "photo": return "📷 Photo";
    case "video": return "🎬 Video";
    case "audio": return "🎵 Audio";
    case "voice": return "🎤 Voice message";
    case "document": return `📎 ${(m.media as { fileName?: string }).fileName ?? "Document"}`;
    case "sticker": return "💟 Sticker";
    case "webpage": return "🔗 Link";
    default: return "📎 Attachment";
  }
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

function handleEvent(event: SSEEvent, qc: QueryClient): void {
  switch (event.type) {
    case "ping":
    case "connected":
      return;

    // ── New message ──────────────────────────────────────────────────────
    case "new_message": {
      const { chatId, message } = event;
      const type = dialogType(qc, chatId);

      // Inject into loaded message cache (newest page = pages[0])
      if (type) {
        const key: unknown[] = ["messages", chatId, type];
        const existing = qc.getQueryData<MessagesData>(key);
        if (existing?.pages.length) {
          const first = existing.pages[0]!;
          const isDupe = first.messages.some((m) => m.id === message.id);
          if (!isDupe) {
            qc.setQueryData<MessagesData>(key, {
              ...existing,
              pages: [
                { ...first, messages: [message, ...first.messages] },
                ...existing.pages.slice(1),
              ],
            });
          }
        }
      }

      // Update dialog list — bump to top, update lastMessage, increment unread
      qc.setQueryData<DialogsData>(["dialogs"], (old) => {
        if (!old) return old;
        const dialogs = old.dialogs.map((d) => {
          if (d.id !== chatId) return d;
          return {
            ...d,
            lastMessage: {
              id: message.id,
              text: message.text || summarizeMedia(message),
              date: message.date,
              out: message.out,
            },
            unreadCount: message.out ? d.unreadCount : d.unreadCount + 1,
          };
        });

        // Reorder: move dialog to top of the unpinned section
        const updated = dialogs.find((d) => d.id === chatId);
        if (!updated) return { ...old, dialogs };
        const others = dialogs.filter((d) => d.id !== chatId);
        const insertAt = others.findIndex((d) => !d.isPinned);
        const reordered =
          insertAt < 0
            ? [...others, updated]
            : [...others.slice(0, insertAt), updated, ...others.slice(insertAt)];
        return { ...old, dialogs: reordered };
      });
      return;
    }

    // ── Edited message ───────────────────────────────────────────────────
    case "edit_message": {
      const { chatId, message } = event;
      mutateMsgPages(qc, chatId, (msgs) =>
        msgs.map((m) => (m.id === message.id ? { ...m, ...message } : m)),
      );
      // Update dialog lastMessage if it was the most recent
      qc.setQueryData<DialogsData>(["dialogs"], (old) => {
        if (!old) return old;
        return {
          ...old,
          dialogs: old.dialogs.map((d) => {
            if (d.id !== chatId || !d.lastMessage || d.lastMessage.id !== message.id) return d;
            return {
              ...d,
              lastMessage: {
                ...d.lastMessage,
                text: message.text || summarizeMedia(message),
              },
            };
          }),
        };
      });
      return;
    }

    // ── Channel/group message deletion (chatId known) ────────────────────
    case "delete_messages": {
      const idSet = new Set(event.ids);
      mutateMsgPages(qc, event.chatId, (msgs) => msgs.filter((m) => !idSet.has(m.id)));
      return;
    }

    // ── Private-chat deletion (chatId unknown — scan all caches) ─────────
    case "delete_messages_global": {
      const idSet = new Set(event.ids);
      for (const [key, data] of qc.getQueriesData<MessagesData>({ queryKey: ["messages"] })) {
        if (!data) continue;
        qc.setQueryData<MessagesData>(key, {
          ...data,
          pages: data.pages.map((p) => ({
            ...p,
            messages: p.messages.filter((m) => !idSet.has(m.id)),
          })),
        });
      }
      return;
    }

    // ── User online/offline status ───────────────────────────────────────
    case "user_status": {
      const { userId, presence } = event;
      qc.setQueryData<DialogsData>(["dialogs"], (old) => {
        if (!old) return old;
        return {
          ...old,
          dialogs: old.dialogs.map((d) =>
            d.id === userId ? { ...d, presence } : d,
          ),
        };
      });
      return;
    }

    // ── Read receipt — inbox (messages seen by us) ───────────────────────
    case "read_inbox": {
      const { chatId, maxId, stillUnread } = event;
      qc.setQueryData<DialogsData>(["dialogs"], (old) => {
        if (!old) return old;
        return {
          ...old,
          dialogs: old.dialogs.map((d) =>
            d.id === chatId
              ? { ...d, readInboxMaxId: maxId, unreadCount: stillUnread }
              : d,
          ),
        };
      });
      return;
    }

    // ── Read receipt — outbox (the other party read our messages) ────────
    case "read_outbox": {
      const { chatId, maxId } = event;
      qc.setQueryData<DialogsData>(["dialogs"], (old) => {
        if (!old) return old;
        return {
          ...old,
          dialogs: old.dialogs.map((d) =>
            d.id === chatId ? { ...d, readOutboxMaxId: maxId } : d,
          ),
        };
      });
      return;
    }

    // ── Typing indicator ─────────────────────────────────────────────────
    case "typing": {
      const { chatId, userId, userName, action } = event;
      setTypingUser(chatId, userId, userName, action);
      return;
    }

    // ── Draft ────────────────────────────────────────────────────────────
    case "dialog_draft":
      // Drafts are loaded fresh on chat open; no cache action needed.
      return;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSSE(): void {
  const qc = useQueryClient();
  // Keep a stable ref so the closure inside useEffect always has the latest qc
  const qcRef = useRef(qc);
  qcRef.current = qc;

  useEffect(() => {
    const sessionId = localStorage.getItem(SESSION_KEY) ?? "";
    const url = `/api/updates?sid=${encodeURIComponent(sessionId)}`;

    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retries = 0;
    let destroyed = false;

    function connect() {
      if (destroyed) return;
      es = new EventSource(url);

      es.onopen = () => {
        retries = 0;
      };

      es.onmessage = (e: MessageEvent) => {
        try {
          const event = JSON.parse(e.data as string) as SSEEvent;
          handleEvent(event, qcRef.current);
        } catch {
          // ignore malformed frames
        }
      };

      es.onerror = () => {
        es?.close();
        es = null;
        if (destroyed) return;
        // Exponential backoff: 1 s, 2 s, 4 s, 8 s … capped at 30 s
        const delay = Math.min(1_000 * 2 ** retries, 30_000);
        retries = Math.min(retries + 1, 5);
        retryTimer = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      destroyed = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
    };
  }, []); // intentionally no deps — one SSE connection per mount
}
