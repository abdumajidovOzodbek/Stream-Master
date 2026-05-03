import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Copy, Reply, ExternalLink, Link2 } from "lucide-react";
import type { Message, Dialog } from "@/lib/api";

interface Props {
  msg: Message;
  dialog: Dialog;
  children: React.ReactNode;
  onReply: (m: Message) => void;
}

export function MessageContextMenu({ msg, dialog, children, onReply }: Props) {
  function copyText() {
    if (msg.text) {
      void navigator.clipboard.writeText(msg.text);
    }
  }

  function copyLink() {
    const base = dialog.username
      ? `https://t.me/${dialog.username}/${msg.id}`
      : `https://t.me/c/${dialog.id}/${msg.id}`;
    void navigator.clipboard.writeText(base);
  }

  function openInTelegram() {
    const url = dialog.username
      ? `https://t.me/${dialog.username}/${msg.id}`
      : `https://t.me/c/${dialog.id}/${msg.id}`;
    window.open(url, "_blank", "noreferrer");
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {msg.text && (
          <ContextMenuItem onClick={copyText} className="gap-2">
            <Copy className="h-4 w-4" />
            Copy text
          </ContextMenuItem>
        )}
        <ContextMenuItem onClick={() => onReply(msg)} className="gap-2">
          <Reply className="h-4 w-4" />
          Reply
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={copyLink} className="gap-2">
          <Link2 className="h-4 w-4" />
          Copy link
        </ContextMenuItem>
        <ContextMenuItem onClick={openInTelegram} className="gap-2">
          <ExternalLink className="h-4 w-4" />
          Open in Telegram
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
