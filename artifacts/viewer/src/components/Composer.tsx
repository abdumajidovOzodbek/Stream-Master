import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Message } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Loader2, Send, X, CornerUpLeft, Paperclip, Image, FileText, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { summarizeReply } from "@/lib/format";

interface ComposerProps {
  chatId: string;
  chatType: "user" | "chat" | "channel";
  replyTo: Message | null;
  onClearReply: () => void;
  onSent?: () => void;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024;

function FilePreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const isImage = file.type.startsWith("image/");
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage) return;
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);

  return (
    <div className="mb-2 flex items-center gap-3 rounded-xl border bg-muted/40 px-3 py-2">
      {isImage && objectUrl ? (
        <img src={objectUrl} alt="preview" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
      ) : (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <FileText className="h-7 w-7 text-primary" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{file.name}</div>
        <div className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</div>
      </div>
      <Button type="button" variant="ghost" size="icon" onClick={onRemove} className="h-9 w-9 shrink-0">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function Composer({ chatId, chatType, replyTo, onClearReply, onSent }: ComposerProps) {
  const [text, setText] = useState("");
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [showScheduler, setShowScheduler] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const qc = useQueryClient();

  // ── Draft: load when chatId changes ────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem(`draft-${chatId}`) ?? "";
    setText(saved);
    setScheduleDate("");
    setShowScheduler(false);
    setAttachedFile(null);
    setSendError(null);
    requestAnimationFrame(() => {
      if (taRef.current) {
        taRef.current.style.height = "auto";
        taRef.current.style.height = Math.min(taRef.current.scrollHeight, 160) + "px";
      }
    });
  }, [chatId]);

  // ── Draft: save on text change (debounced 300 ms) ───────────────
  useEffect(() => {
    const t = setTimeout(() => {
      if (text.trim()) localStorage.setItem(`draft-${chatId}`, text);
      else localStorage.removeItem(`draft-${chatId}`);
    }, 300);
    return () => clearTimeout(t);
  }, [chatId, text]);

  const sendText = useMutation({
    mutationFn: ({ msg, schedUnix }: { msg: string; schedUnix?: number }) =>
      api.sendMessage(chatId, msg, replyTo?.id, schedUnix),
    onSuccess: async (_, { schedUnix }) => {
      setText("");
      setScheduleDate("");
      setShowScheduler(false);
      setSendError(null);
      localStorage.removeItem(`draft-${chatId}`);
      onClearReply();
      if (!schedUnix) {
        await qc.invalidateQueries({ queryKey: ["messages", chatId, chatType] });
      }
      await qc.invalidateQueries({ queryKey: ["dialogs"] });
      onSent?.();
      requestAnimationFrame(() => taRef.current?.focus());
    },
    onError: (err) => setSendError((err as Error).message),
  });

  const sendMedia = useMutation({
    mutationFn: (f: File) => api.sendMedia(chatId, f, text.trim() || undefined, replyTo?.id),
    onSuccess: async () => {
      setText("");
      setAttachedFile(null);
      setScheduleDate("");
      setShowScheduler(false);
      setSendError(null);
      localStorage.removeItem(`draft-${chatId}`);
      onClearReply();
      await qc.invalidateQueries({ queryKey: ["messages", chatId, chatType] });
      await qc.invalidateQueries({ queryKey: ["dialogs"] });
      onSent?.();
      requestAnimationFrame(() => taRef.current?.focus());
    },
    onError: (err) => setSendError((err as Error).message),
  });

  const isPending = sendText.isPending || sendMedia.isPending;

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
    if (attachedFile) { sendMedia.mutate(attachedFile); return; }
    const trimmed = text.trim();
    if (!trimmed) return;
    const schedUnix = scheduleDate
      ? Math.floor(new Date(scheduleDate).getTime() / 1000)
      : undefined;
    sendText.mutate({ msg: trimmed, schedUnix });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape" && replyTo) { e.preventDefault(); onClearReply(); return; }
    if (e.key === "Enter" && !e.shiftKey && window.innerWidth >= 768) {
      e.preventDefault();
      submit();
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFileError(null);
    if (!f) return;
    if (f.size > MAX_FILE_SIZE) { setFileError("File is too large (max 50 MB)"); e.target.value = ""; return; }
    setAttachedFile(f);
    e.target.value = "";
  }

  const canSend = !isPending && (!!attachedFile || !!text.trim());

  // Minimum allowed schedule time (1 minute from now)
  const minSchedule = new Date(Date.now() + 60_000).toISOString().slice(0, 16);

  return (
    <div
      className="border-t bg-background/90 px-3 py-2.5 backdrop-blur-lg"
      style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}
    >
      {(sendError || fileError) && (
        <div className="mb-2 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1 text-[11px] text-destructive">
          {sendError ?? fileError}
        </div>
      )}

      {/* Scheduled message banner */}
      {scheduleDate && (
        <div className="mb-2 flex items-center gap-2 rounded-md border border-amber-300/40 bg-amber-50/60 px-2.5 py-2 dark:border-amber-700/40 dark:bg-amber-950/30">
          <Clock className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="flex-1 text-[11px] text-amber-700 dark:text-amber-300">
            Scheduled for {new Date(scheduleDate).toLocaleString()}
          </span>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0"
            onClick={() => setScheduleDate("")}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Schedule picker */}
      {showScheduler && (
        <div className="mb-2 flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
          <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
          <label className="shrink-0 text-xs text-muted-foreground">Send at</label>
          <input
            type="datetime-local"
            value={scheduleDate}
            min={minSchedule}
            onChange={(e) => setScheduleDate(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none"
          />
        </div>
      )}

      {/* Reply preview */}
      {replyTo && (
        <div className="mb-2 flex items-center gap-2 rounded-md border-l-2 border-primary bg-muted/60 px-2.5 py-2">
          <CornerUpLeft className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-medium text-primary">
              Replying to {replyTo.fromName ?? (replyTo.out ? "yourself" : "message")}
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              {summarizeReply(replyTo.text, !!replyTo.media)}
            </div>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClearReply}
            className="h-8 w-8 shrink-0" aria-label="Cancel reply">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* File preview */}
      {attachedFile && <FilePreview file={attachedFile} onRemove={() => setAttachedFile(null)} />}

      <div className="flex items-end gap-2">
        {/* Attach button */}
        <Button
          type="button" variant="ghost" size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={isPending}
          title="Attach file"
          className="h-11 w-11 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
        >
          {attachedFile
            ? <Image className="h-5 w-5 text-primary" />
            : <Paperclip className="h-5 w-5" />}
        </Button>
        <input
          ref={fileInputRef} type="file" className="hidden"
          onChange={onFileChange}
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip,.rar"
        />

        {/* Schedule button */}
        <Button
          type="button" variant="ghost" size="icon"
          onClick={() => setShowScheduler((v) => !v)}
          disabled={isPending || !!attachedFile}
          title="Schedule message"
          className={cn(
            "h-11 w-11 shrink-0 rounded-full text-muted-foreground hover:text-foreground",
            (showScheduler || scheduleDate) && "text-amber-500 hover:text-amber-600",
          )}
        >
          <Clock className="h-5 w-5" />
        </Button>

        {/* Textarea */}
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => { setText(e.target.value); autoResize(); }}
          onKeyDown={onKeyDown}
          placeholder={
            scheduleDate ? "Type a scheduled message…"
              : attachedFile ? "Add a caption…"
              : "Write a message…"
          }
          rows={1}
          style={{ fontSize: "16px" }}
          className={cn(
            "flex-1 resize-none rounded-2xl border bg-muted/60 px-4 py-2.5 leading-[1.5]",
            "outline-none transition-colors placeholder:text-muted-foreground/60",
            "focus:border-primary/60 focus:bg-background",
            "max-h-40 min-h-[44px]",
          )}
          disabled={isPending}
        />

        {/* Send button */}
        <Button
          type="button" size="icon"
          onClick={submit}
          disabled={!canSend}
          className={cn(
            "h-11 w-11 shrink-0 rounded-full",
            scheduleDate && "bg-amber-500 hover:bg-amber-600",
          )}
          title={scheduleDate ? `Schedule for ${new Date(scheduleDate).toLocaleString()}` : "Send"}
        >
          {isPending
            ? <Loader2 className="h-5 w-5 animate-spin" />
            : scheduleDate
              ? <Clock className="h-5 w-5" />
              : <Send className="h-5 w-5" />}
        </Button>
      </div>

      {/* Keyboard hint — desktop only */}
      <div className="mt-1 hidden px-2 text-[10px] text-muted-foreground md:block">
        Enter to send · Shift+Enter for new line
        {replyTo && " · Esc to cancel reply"}
      </div>
    </div>
  );
}
