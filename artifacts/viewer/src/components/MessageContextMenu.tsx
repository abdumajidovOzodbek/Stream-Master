import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Copy, Reply, ExternalLink, Link2, Pencil, Trash2, Forward, Pin, PinOff } from "lucide-react";
import type { Message, Dialog } from "@/lib/api";

interface Props {
  msg: Message;
  dialog: Dialog;
  children: React.ReactNode;
  onReply: (m: Message) => void;
  onEdit?: (m: Message) => void;
  onDelete?: (m: Message) => void;
  onForward?: (m: Message) => void;
  onPin?: (m: Message) => void;
}

export function MessageContextMenu({ msg, dialog, children, onReply, onEdit, onDelete, onForward, onPin }: Props) {
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
      <ContextMenuContent className="w-52">
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
        {onForward && (
          <ContextMenuItem onClick={() => onForward(msg)} className="gap-2">
            <Forward className="h-4 w-4" />
            Forward
          </ContextMenuItem>
        )}
        {msg.out && onEdit && (
          <ContextMenuItem onClick={() => onEdit(msg)} className="gap-2">
            <Pencil className="h-4 w-4" />
            Edit
          </ContextMenuItem>
        )}
        {onPin && (
          <ContextMenuItem onClick={() => onPin(msg)} className="gap-2">
            {msg.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            {msg.pinned ? "Unpin" : "Pin"}
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={copyLink} className="gap-2">
          <Link2 className="h-4 w-4" />
          Copy link
        </ContextMenuItem>
        <ContextMenuItem onClick={openInTelegram} className="gap-2">
          <ExternalLink className="h-4 w-4" />
          Open in Telegram
        </ContextMenuItem>
        {(msg.out || dialog.type !== "channel") && onDelete && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => onDelete(msg)} className="gap-2 text-destructive focus:text-destructive">
              <Trash2 className="h-4 w-4" />
              Delete
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
