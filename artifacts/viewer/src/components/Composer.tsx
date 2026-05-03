import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Message } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Loader2, Send, X, CornerUpLeft, Paperclip, Image, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { summarizeReply } from "@/lib/format";

interface ComposerProps {
  chatId: string;
  chatType: "user" | "chat" | "channel";
  replyTo: Message | null;
  onClearReply: () => void;
  onSent?: () => void;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

function FilePreview({
  file,
  onRemove,
}: {
  file: File;
  onRemove: () => void;
}) {
  const isImage = file.type.startsWith("image/");
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage) return;
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);

  return (
    <div className="mb-2 flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
      {isImage && objectUrl ? (
        <img
          src={objectUrl}
          alt="preview"
          className="h-12 w-12 shrink-0 rounded-md object-cover"
        />
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <FileText className="h-6 w-6 text-primary" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{file.name}</div>
        <div className="text-xs text-muted-foreground">
          {(file.size / 1024 / 1024).toFixed(1)} MB
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        className="h-6 w-6 shrink-0"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function Composer({
  chatId,
  chatType,
  replyTo,
  onClearReply,
  onSent,
}: ComposerProps) {
  const [text, setText] = useState("");
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const qc = useQueryClient();

  const sendText = useMutation({
    mutationFn: (msg: string) =>
      api.sendMessage(chatId, msg, replyTo?.id),
    onSuccess: async () => {
      setText("");
      setSendError(null);
      onClearReply();
      await qc.invalidateQueries({ queryKey: ["messages", chatId, chatType] });
      await qc.invalidateQueries({ queryKey: ["dialogs"] });
      onSent?.();
      requestAnimationFrame(() => taRef.current?.focus());
    },
    onError: (err) => setSendError((err as Error).message),
  });

  const sendMedia = useMutation({
    mutationFn: (f: File) =>
      api.sendMedia(chatId, f, text.trim() || undefined, replyTo?.id),
    onSuccess: async () => {
      setText("");
      setAttachedFile(null);
      setSendError(null);
      onClearReply();
      await qc.invalidateQueries({ queryKey: ["messages", chatId, chatType] });
      await qc.invalidateQueries({ queryKey: ["dialogs"] });
      onSent?.();
      requestAnimationFrame(() => taRef.current?.focus());
    },
    onError: (err) => setSendError((err as Error).message),
  });

  const isPending = sendText.isPending || sendMedia.isPending;

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
    if (isPending) return;
    if (attachedFile) {
      sendMedia.mutate(attachedFile);
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) return;
    sendText.mutate(trimmed);
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

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFileError(null);
    if (!f) return;
    if (f.size > MAX_FILE_SIZE) {
      setFileError("File is too large (max 50 MB)");
      e.target.value = "";
      return;
    }
    setAttachedFile(f);
    e.target.value = "";
  }

  const canSend = !isPending && (!!attachedFile || !!text.trim());

  return (
    <div className="border-t bg-card/80 px-3 py-2 backdrop-blur">
      {(sendError || fileError) && (
        <div className="mb-2 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1 text-[11px] text-destructive">
          {sendError ?? fileError}
        </div>
      )}

      {/* Reply preview */}
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

      {/* File preview */}
      {attachedFile && (
        <FilePreview file={attachedFile} onRemove={() => setAttachedFile(null)} />
      )}

      <div className="flex items-end gap-2">
        {/* File attach */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={isPending}
          title="Attach file"
          className="h-10 w-10 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
        >
          {attachedFile ? (
            <Image className="h-5 w-5 text-primary" />
          ) : (
            <Paperclip className="h-5 w-5" />
          )}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={onFileChange}
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip,.rar"
        />

        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            autoResize();
          }}
          onKeyDown={onKeyDown}
          placeholder={
            attachedFile
              ? "Add a caption (optional)…"
              : chatType === "channel"
                ? "Send a message (channel admins only)…"
                : "Write a message…"
          }
          rows={1}
          className={cn(
            "flex-1 resize-none rounded-2xl border bg-background px-4 py-2 text-sm",
            "outline-none transition-colors focus:border-primary",
            "max-h-40 min-h-[40px] leading-5",
          )}
          disabled={isPending}
        />
        <Button
          type="button"
          size="icon"
          onClick={submit}
          disabled={!canSend}
          className="h-10 w-10 shrink-0 rounded-full"
        >
          {isPending ? (
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
