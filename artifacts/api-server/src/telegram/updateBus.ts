import { EventEmitter } from "node:events";

// ---------------------------------------------------------------------------
// SSE event types — serialised to JSON and sent to the browser
// ---------------------------------------------------------------------------

export type UserPresenceSummary =
  | { kind: "online"; expires: number }
  | { kind: "offline"; wasOnline: number }
  | { kind: "recently" }
  | { kind: "lastWeek" }
  | { kind: "lastMonth" }
  | { kind: "longAgo" };

export type SSEEvent =
  | { type: "ping" }
  | { type: "connected" }
  | { type: "new_message"; chatId: string; message: Record<string, unknown> }
  | { type: "edit_message"; chatId: string; message: Record<string, unknown> }
  /** Channel/group deletions — chatId known */
  | { type: "delete_messages"; chatId: string; ids: number[] }
  /** Private-chat deletions — chatId unknown, broadcast globally */
  | { type: "delete_messages_global"; ids: number[] }
  | { type: "user_status"; userId: string; presence: UserPresenceSummary | null }
  | { type: "read_inbox"; chatId: string; maxId: number; stillUnread: number }
  | { type: "read_outbox"; chatId: string; maxId: number }
  | { type: "typing"; chatId: string; userId: string; userName: string; action: string }
  | { type: "dialog_draft"; chatId: string; text: string };

// ---------------------------------------------------------------------------
// Per-session bus
// ---------------------------------------------------------------------------

const buses = new Map<string, EventEmitter>();

export function getOrCreateBus(sessionId: string): EventEmitter {
  let bus = buses.get(sessionId);
  if (!bus) {
    bus = new EventEmitter();
    bus.setMaxListeners(20);
    buses.set(sessionId, bus);
  }
  return bus;
}

export function emitToSession(sessionId: string, event: SSEEvent): void {
  buses.get(sessionId)?.emit("update", event);
}

export function destroyBus(sessionId: string): void {
  const bus = buses.get(sessionId);
  if (bus) {
    bus.removeAllListeners();
    buses.delete(sessionId);
  }
}
