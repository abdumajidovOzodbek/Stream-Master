import { useEffect, useRef, useState, useCallback, type KeyboardEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Message } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Loader2, Send, X, CornerUpLeft, Paperclip, Image, FileText, Clock,
  Bold, Italic, Code, Strikethrough, Mic, Square, Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { summarizeReply } from "@/lib/format";

interface ComposerProps {
  chatId: string;
  chatType: "user" | "chat" | "channel";
  replyTo: Message | null;
  onClearReply: () => void;
  onSent?: () => void;
  editMsg?: Message | null;
  onClearEdit?: () => void;
  injectedText?: string | null;
  onClearInjectedText?: () => void;
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

function formatDurationVoice(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function Composer({ chatId, chatType, replyTo, onClearReply, onSent, editMsg, onClearEdit, injectedText, onClearInjectedText }: ComposerProps) {
  const [text, setText] = useState("");
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [showScheduler, setShowScheduler] = useState(false);
  const [showFormatToolbar, setShowFormatToolbar] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const qc = useQueryClient();

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Typing indicator ──────────────────────────────────────────
  const isTypingRef = useRef(false);
  const cancelTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTyping = useCallback(() => {
    if (!isTypingRef.current) return;
    if (cancelTypingTimerRef.current) {
      clearTimeout(cancelTypingTimerRef.current);
      cancelTypingTimerRef.current = null;
    }
    api.setTyping(chatId, "cancel");
    isTypingRef.current = false;
  }, [chatId]);

  const startTyping = useCallback(() => {
    if (!isTypingRef.current) {
      api.setTyping(chatId, "typing");
      isTypingRef.current = true;
    }
    if (cancelTypingTimerRef.current) clearTimeout(cancelTypingTimerRef.current);
    cancelTypingTimerRef.current = setTimeout(stopTyping, 5_500);
  }, [chatId, stopTyping]);

  useEffect(() => {
    return () => {
      if (isTypingRef.current) {
        api.setTyping(chatId, "cancel");
        isTypingRef.current = false;
      }
      if (cancelTypingTimerRef.current) clearTimeout(cancelTypingTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  // ── Draft: load when chatId changes ────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem(`draft-${chatId}`) ?? "";
    setText(saved);
    setScheduleDate("");
    setShowScheduler(false);
    setAttachedFile(null);
    setSendError(null);
    setShowFormatToolbar(false);
    requestAnimationFrame(() => {
      if (taRef.current) {
        taRef.current.style.height = "auto";
        taRef.current.style.height = Math.min(taRef.current.scrollHeight, 160) + "px";
      }
    });
  }, [chatId]);

  // ── Edit mode: populate text when editMsg changes ────────────────
  useEffect(() => {
    if (editMsg) {
      setText(editMsg.text);
      requestAnimationFrame(() => {
        taRef.current?.focus();
        if (taRef.current) {
          taRef.current.style.height = "auto";
          taRef.current.style.height = Math.min(taRef.current.scrollHeight, 160) + "px";
        }
      });
    }
  }, [editMsg?.id]);

  // ── Injected text from bot commands ────────────────────────────
  useEffect(() => {
    if (injectedText) {
      setText(injectedText + " ");
      onClearInjectedText?.();
      requestAnimationFrame(() => taRef.current?.focus());
    }
  }, [injectedText]);

  // ── Draft: save on text change ───────────────────────────────
  useEffect(() => {
    if (editMsg) return; // Don't save draft in edit mode
    const t = setTimeout(() => {
      if (text.trim()) localStorage.setItem(`draft-${chatId}`, text);
      else localStorage.removeItem(`draft-${chatId}`);
    }, 300);
    return () => clearTimeout(t);
  }, [chatId, text, editMsg]);

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

  const editMessage = useMutation({
    mutationFn: ({ msg }: { msg: string }) => api.editMessage(chatId, editMsg!.id, msg),
    onSuccess: async () => {
      setText("");
      setSendError(null);
      onClearEdit?.();
      await qc.invalidateQueries({ queryKey: ["messages", chatId, chatType] });
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

  const isPending = sendText.isPending || sendMedia.isPending || editMessage.isPending;

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
    stopTyping();

    if (editMsg) {
      const trimmed = text.trim();
      if (!trimmed) return;
      editMessage.mutate({ msg: trimmed });
      return;
    }

    if (attachedFile) { sendMedia.mutate(attachedFile); return; }
    const trimmed = text.trim();
    if (!trimmed) return;
    const schedUnix = scheduleDate
      ? Math.floor(new Date(scheduleDate).getTime() / 1000)
      : undefined;
    sendText.mutate({ msg: trimmed, schedUnix });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      if (editMsg) { e.preventDefault(); onClearEdit?.(); setText(localStorage.getItem(`draft-${chatId}`) ?? ""); return; }
      if (replyTo) { e.preventDefault(); onClearReply(); return; }
    }
    if (e.key === "Enter" && !e.shiftKey && window.innerWidth >= 768) {
      e.preventDefault();
      submit();
    }
    // Ctrl+B / Ctrl+I / Ctrl+` for formatting
    if (e.ctrlKey || e.metaKey) {
      if (e.key === "b") { e.preventDefault(); wrapSelection("**", "**"); return; }
      if (e.key === "i") { e.preventDefault(); wrapSelection("_", "_"); return; }
      if (e.key === "`") { e.preventDefault(); wrapSelection("`", "`"); return; }
    }
  }

  function wrapSelection(before: string, after: string) {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = text.slice(start, end);
    const newText = text.slice(0, start) + before + selected + after + text.slice(end);
    setText(newText);
    requestAnimationFrame(() => {
      ta.selectionStart = start + before.length;
      ta.selectionEnd = end + before.length;
      ta.focus();
    });
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFileError(null);
    if (!f) return;
    if (f.size > MAX_FILE_SIZE) { setFileError("File is too large (max 50 MB)"); e.target.value = ""; return; }
    setAttachedFile(f);
    e.target.value = "";
  }

  // ── Voice recording ───────────────────────────────────────────

  async function startRecording() {
    setRecordingError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
          ? "audio/ogg;codecs=opus"
          : "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mr;
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const ext = mimeType.includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `voice_${Date.now()}.${ext}`, { type: mimeType });
        sendMedia.mutate(file);
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        setRecordingDuration(0);
        setIsRecording(false);
      };
      mr.start(250);
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1000);
      }, 1000);
    } catch (err) {
      setRecordingError("Microphone access denied");
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }

  function cancelRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream?.getTracks().forEach((t) => t.stop());
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordingDuration(0);
  }

  const canSend = !isPending && (!!attachedFile || !!text.trim());

  const minSchedule = new Date(Date.now() + 60_000).toISOString().slice(0, 16);

  if (isRecording) {
    return (
      <div
        className="border-t bg-background/90 px-3 py-2.5 backdrop-blur-lg"
        style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-3">
          <div className="h-3 w-3 animate-pulse rounded-full bg-destructive" />
          <span className="flex-1 text-sm font-medium text-destructive">
            Recording… {formatDurationVoice(recordingDuration)}
          </span>
          <Button type="button" variant="ghost" size="icon" onClick={cancelRecording} className="h-9 w-9 text-muted-foreground" title="Cancel">
            <X className="h-4 w-4" />
          </Button>
          <Button type="button" size="icon" onClick={stopRecording} className="h-11 w-11 rounded-full bg-destructive hover:bg-destructive/80" title="Send voice message">
            {sendMedia.isPending ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : <Send className="h-5 w-5 text-white" />}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="border-t bg-background/90 px-3 py-2.5 backdrop-blur-lg"
      style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}
    >
      {(sendError || fileError || recordingError) && (
        <div className="mb-2 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1 text-[11px] text-destructive">
          {sendError ?? fileError ?? recordingError}
        </div>
      )}

      {/* Formatting toolbar */}
      {showFormatToolbar && (
        <div className="mb-2 flex items-center gap-1 rounded-lg border bg-muted/40 p-1">
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-xs font-bold" title="Bold (Ctrl+B)"
            onClick={() => wrapSelection("**", "**")}>
            <Bold className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-xs italic" title="Italic (Ctrl+I)"
            onClick={() => wrapSelection("_", "_")}>
            <Italic className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 font-mono text-xs" title="Code (Ctrl+`)"
            onClick={() => wrapSelection("`", "`")}>
            <Code className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-xs" title="Strikethrough"
            onClick={() => wrapSelection("~~", "~~")}>
            <Strikethrough className="h-3.5 w-3.5" />
          </Button>
          <div className="mx-1 h-5 w-px bg-border" />
          <span className="text-[10px] text-muted-foreground">Ctrl+B/I/` for shortcuts</span>
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

      {/* Edit mode banner */}
      {editMsg && (
        <div className="mb-2 flex items-center gap-2 rounded-md border-l-2 border-amber-500 bg-amber-50/60 dark:bg-amber-950/30 px-2.5 py-2">
          <Pencil className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-medium text-amber-700 dark:text-amber-300">
              Editing message
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              {editMsg.text.slice(0, 60)}{editMsg.text.length > 60 ? "…" : ""}
            </div>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => { onClearEdit?.(); setText(localStorage.getItem(`draft-${chatId}`) ?? ""); }}
            className="h-8 w-8 shrink-0" aria-label="Cancel edit">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Reply preview */}
      {replyTo && !editMsg && (
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
        {/* Format toolbar toggle */}
        <Button
          type="button" variant="ghost" size="icon"
          onClick={() => setShowFormatToolbar((v) => !v)}
          disabled={isPending}
          title="Formatting"
          className={cn(
            "h-11 w-11 shrink-0 rounded-full text-muted-foreground hover:text-foreground",
            showFormatToolbar && "bg-primary/10 text-primary",
          )}
        >
          <Bold className="h-4 w-4" />
        </Button>

        {/* Attach button */}
        <Button
          type="button" variant="ghost" size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={isPending || !!editMsg}
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
        {!editMsg && (
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
        )}

        {/* Textarea */}
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => {
            const newText = e.target.value;
            setText(newText);
            autoResize();
            if (!scheduleDate && !attachedFile && !editMsg) {
              if (newText.trim()) startTyping();
              else stopTyping();
            }
          }}
          onKeyDown={onKeyDown}
          placeholder={
            editMsg ? "Edit message…"
              : scheduleDate ? "Type a scheduled message…"
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
            editMsg && "border-amber-400/60 focus:border-amber-500/80",
          )}
          disabled={isPending}
        />

        {/* Voice recording button (show when no text typed, no file attached, no edit) */}
        {!text.trim() && !attachedFile && !editMsg && (
          <Button
            type="button" size="icon"
            onClick={() => void startRecording()}
            disabled={isPending}
            title="Record voice message"
            className="h-11 w-11 shrink-0 rounded-full bg-muted/80 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Mic className="h-5 w-5" />
          </Button>
        )}

        {/* Send button */}
        {(!!text.trim() || !!attachedFile || !!editMsg) && (
          <Button
            type="button" size="icon"
            onClick={submit}
            disabled={!canSend && !editMsg}
            className={cn(
              "h-11 w-11 shrink-0 rounded-full",
              scheduleDate && !editMsg && "bg-amber-500 hover:bg-amber-600",
              editMsg && "bg-amber-500 hover:bg-amber-600",
            )}
            title={
              editMsg ? "Save edit"
                : scheduleDate ? `Schedule for ${new Date(scheduleDate).toLocaleString()}`
                : "Send"
            }
          >
            {isPending
              ? <Loader2 className="h-5 w-5 animate-spin" />
              : editMsg
                ? <Pencil className="h-5 w-5" />
                : scheduleDate
                  ? <Clock className="h-5 w-5" />
                  : <Send className="h-5 w-5" />}
          </Button>
        )}
      </div>

      {/* Keyboard hint — desktop only */}
      <div className="mt-1 hidden px-2 text-[10px] text-muted-foreground md:block">
        {editMsg
          ? "Enter to save · Esc to cancel edit"
          : `Enter to send · Shift+Enter for new line${replyTo ? " · Esc to cancel reply" : ""}`}
      </div>
    </div>
  );
}
