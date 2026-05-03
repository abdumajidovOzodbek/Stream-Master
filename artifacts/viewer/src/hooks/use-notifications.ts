import { useEffect, useRef } from "react";
import type { Dialog } from "@/lib/api";

/**
 * Requests notification permission and fires a desktop notification whenever
 * the total unread count rises while the browser tab is not focused.
 *
 * @param dialogs   - Current list of dialogs (kept up-to-date by the poller).
 * @param onSelect  - Called with the matching dialog when the user clicks a notification.
 */
export function useDesktopNotifications(
  dialogs: Dialog[],
  onSelect: (d: Dialog) => void,
) {
  const prevCountsRef = useRef<Map<string, number>>(new Map());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Request permission once on mount.
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;

    const prev = prevCountsRef.current;

    for (const d of dialogs) {
      const key = `${d.type}-${d.id}`;
      const prevCount = prev.get(key) ?? d.unreadCount;
      const newMessages = d.unreadCount - prevCount;

      // Only notify if the count went up and the tab is not focused.
      if (newMessages > 0 && !document.hasFocus()) {
        const body =
          d.lastMessage?.text
            ? d.lastMessage.text.slice(0, 100)
            : `${newMessages} new message${newMessages > 1 ? "s" : ""}`;

        const n = new Notification(d.title, {
          body,
          tag: key,
          icon: d.hasPhoto
            ? `/api/photo/${encodeURIComponent(d.id)}`
            : undefined,
        } as NotificationOptions);

        n.onclick = () => {
          window.focus();
          onSelectRef.current(d);
          n.close();
        };
      }

      prev.set(key, d.unreadCount);
    }
  }, [dialogs]);
}
