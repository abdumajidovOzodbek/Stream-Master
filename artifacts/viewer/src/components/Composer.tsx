import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Message } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Loader2, Send, X, CornerUpLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { summarizeReply } from "@/lib/format";

interface ComposerProps {
  chatId: string;
  chatType: "user" | "chat" | "channel";
  replyTo: Message | null;
  onClearReply: () => void;
  onSent?: () => void;
}

export function Composer({
  chatId,
  chatType,
  replyTo,
  onClearReply,
  onSent,
}: ComposerProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const qc = useQueryClient();

  const send = useMutation({
    mutationFn: (msg: string) =>
      api.sendMessage(chatId, msg, replyTo?.id),
    onSuccess: async () => {
      setText("");
      setError(null);
      onClearReply();
      await qc.invalidateQueries({ queryKey: ["messages", chatId, chatType] });
      await qc.invalidateQueries({ queryKey: ["dialogs"] });
      onSent?.();
      requestAnimationFrame(() => taRef.current?.focus());
    },
    onError: (err) => {
      setError((err as Error).message);
    },
  });

  // Focus textarea when a reply target is set.
  useEffect(() => {
    if (replyTo) taRef.current?.focus();
  }, [replyTo]);

  function autoResize() {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || send.isPending) return;
    send.mutate(trimmed);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape" && replyTo) {
      e.preventDefault();
      onClearReply();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="border-t bg-card/80 px-3 py-2 backdrop-blur">
      {error && (
        <div className="mb-2 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1 text-[11px] text-destructive">
          {error}
        </div>
      )}
      {replyTo && (
        <div
          className="mb-2 flex items-center gap-2 rounded-md border-l-2 border-primary bg-muted/60 px-2.5 py-1.5"
          data-testid="composer-reply-preview"
        >
          <CornerUpLeft className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-medium text-primary">
              Replying to {replyTo.fromName ?? (replyTo.out ? "yourself" : "message")}
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              {summarizeReply(replyTo.text, !!replyTo.media)}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClearReply}
            className="h-6 w-6 shrink-0"
            aria-label="Cancel reply"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            autoResize();
          }}
          onKeyDown={onKeyDown}
          placeholder={
            chatType === "channel"
              ? "Send a message (only channel admins can post)…"
              : "Write a message…"
          }
          rows={1}
          className={cn(
            "flex-1 resize-none rounded-2xl border bg-background px-4 py-2 text-sm",
            "outline-none transition-colors focus:border-primary",
            "max-h-40 min-h-[40px] leading-5",
          )}
          disabled={send.isPending}
        />
        <Button
          type="button"
          size="icon"
          onClick={submit}
          disabled={!text.trim() || send.isPending}
          className="h-10 w-10 shrink-0 rounded-full"
        >
          {send.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
      <div className="mt-1 px-2 text-[10px] text-muted-foreground">
        Enter to send · Shift+Enter for new line
        {replyTo && " · Esc to cancel reply"}
      </div>
    </div>
  );
}
