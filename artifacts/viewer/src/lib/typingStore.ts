/**
 * Global typing indicator state.
 *
 * Telegram clears typing after ~6 seconds of inactivity. We mirror that
 * behavior by scheduling auto-expiry timers. Subscribers receive updates
 * via a window custom event so they can re-render without React context.
 *
 * Usage:
 *   import { setTypingUser, getTypingNames } from "@/lib/typingStore";
 *   window.addEventListener("tg:typing", listener); // { detail: { chatId } }
 */

const TYPING_EXPIRY_MS = 6_000;

interface TypingEntry {
  userName: string;
  expires: number;
  timer: ReturnType<typeof setTimeout>;
}

// chatId → userId → TypingEntry
const store = new Map<string, Map<string, TypingEntry>>();

function notify(chatId: string) {
  window.dispatchEvent(new CustomEvent("tg:typing", { detail: { chatId } }));
}

export function setTypingUser(
  chatId: string,
  userId: string,
  userName: string,
  action: string,
): void {
  if (!store.has(chatId)) store.set(chatId, new Map());
  const chatMap = store.get(chatId)!;

  const prev = chatMap.get(userId);
  if (prev) clearTimeout(prev.timer);

  if (action === "cancel") {
    chatMap.delete(userId);
    if (chatMap.size === 0) store.delete(chatId);
    notify(chatId);
    return;
  }

  const timer = setTimeout(() => {
    chatMap.delete(userId);
    if (chatMap.size === 0) store.delete(chatId);
    notify(chatId);
  }, TYPING_EXPIRY_MS);

  chatMap.set(userId, { userName, expires: Date.now() + TYPING_EXPIRY_MS, timer });
  notify(chatId);
}

export function getTypingNames(chatId: string): string[] {
  const chatMap = store.get(chatId);
  if (!chatMap) return [];
  const now = Date.now();
  const names: string[] = [];
  for (const [, entry] of chatMap) {
    if (entry.expires > now) names.push(entry.userName);
  }
  return names;
}

/** Register a listener for typing changes in a specific chat. Returns cleanup fn. */
export function onTypingChange(
  chatId: string,
  callback: (names: string[]) => void,
): () => void {
  function handler(e: Event) {
    const { chatId: eventChatId } = (e as CustomEvent<{ chatId: string }>).detail;
    if (eventChatId === chatId) callback(getTypingNames(chatId));
  }
  window.addEventListener("tg:typing", handler);
  return () => window.removeEventListener("tg:typing", handler);
}
