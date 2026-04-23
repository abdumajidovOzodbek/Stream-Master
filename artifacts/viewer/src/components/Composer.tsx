import { useRef, useState, type KeyboardEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface ComposerProps {
  chatId: string;
  chatType: "user" | "chat" | "channel";
  onSent?: () => void;
}

export function Composer({ chatId, chatType, onSent }: ComposerProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const qc = useQueryClient();

  const send = useMutation({
    mutationFn: (msg: string) => api.sendMessage(chatId, msg),
    onSuccess: async () => {
      setText("");
      setError(null);
      await qc.invalidateQueries({ queryKey: ["messages", chatId, chatType] });
      await qc.invalidateQueries({ queryKey: ["dialogs"] });
      onSent?.();
      requestAnimationFrame(() => taRef.current?.focus());
    },
    onError: (err) => {
      setError((err as Error).message);
    },
  });

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
      </div>
    </div>
  );
}
