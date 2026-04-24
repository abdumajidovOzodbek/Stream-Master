import type { UserPresence } from "./api";

export function formatPresence(p: UserPresence | null): {
  label: string;
  online: boolean;
} {
  if (!p) return { label: "", online: false };
  if (p.kind === "online") return { label: "online", online: true };
  if (p.kind === "recently") return { label: "last seen recently", online: false };
  if (p.kind === "lastWeek")
    return { label: "last seen within a week", online: false };
  if (p.kind === "lastMonth")
    return { label: "last seen within a month", online: false };
  if (p.kind === "longAgo")
    return { label: "last seen a long time ago", online: false };
  // offline
  const ts = p.wasOnline * 1000;
  const diffSec = (Date.now() - ts) / 1000;
  if (diffSec < 60) return { label: "last seen just now", online: false };
  if (diffSec < 3600)
    return { label: `last seen ${Math.floor(diffSec / 60)}m ago`, online: false };
  if (diffSec < 86400)
    return {
      label: `last seen ${Math.floor(diffSec / 3600)}h ago`,
      online: false,
    };
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString())
    return {
      label: `last seen at ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
      online: false,
    };
  const yesterday = new Date(Date.now() - 86400_000);
  if (d.toDateString() === yesterday.toDateString())
    return {
      label: `last seen yesterday at ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
      online: false,
    };
  return {
    label: `last seen ${d.toLocaleDateString([], { month: "short", day: "numeric" })}`,
    online: false,
  };
}

export function summarizeReply(text: string, hasMedia: boolean): string {
  if (text) return text;
  if (hasMedia) return "Media";
  return "Message";
}
