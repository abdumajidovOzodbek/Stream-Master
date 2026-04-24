import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Dialog, type Message, type MessageMedia } from "@/lib/api";
import { ChatAvatar, senderTextColor } from "./Avatar";
import { Composer } from "./Composer";
import { PhotoLightbox } from "./PhotoLightbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  ExternalLink,
  Download,
  FileText,
  Music,
  Mic,
  Eye,
  BadgeCheck,
  ImageOff,
  Image as ImageIcon,
  Play,
  Sticker,
  Reply,
  CornerUpLeft,
  Forward,
  Pencil,
  Check,
  CheckCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPresence, summarizeReply } from "@/lib/format";

const PAGE_SIZE = 50;

function formatBytes(b: number | null): string {
  if (!b) return "";
  const u = ["B", "KB", "MB", "GB"];
  let v = b,
    i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${u[i]}`;
}

function formatDuration(s: number | null): string {
  if (!s) return "";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function formatTime(t: number): string {
  return new Date(t * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateLabel(t: number): string {
  const d = new Date(t * 1000);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function PhotoBlock({
  url,
  width,
  height,
  onOpenLightbox,
}: {
  url: string;
  width: number | null;
  height: number | null;
  onOpenLightbox: (url: string) => void;
}) {
  const [load, setLoad] = useState(false);
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");

  const ratio = width && height ? width / height : 4 / 3;
  const w = 280;
  const h = Math.round(w / ratio);

  if (!load) {
    return (
      <button
        type="button"
        onClick={() => setLoad(true)}
        className="group flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/40 p-4 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        style={{ width: w, height: h }}
      >
        <ImageIcon className="h-8 w-8" />
        <span className="text-xs font-medium">Load photo</span>
        {width && height && (
          <span className="text-[10px] opacity-70">
            {width} × {height}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-lg bg-black/5 dark:bg-white/5">
      {state === "loading" && (
        <div
          className="flex items-center justify-center"
          style={{ width: w, height: h }}
        >
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {state === "error" && (
        <div
          className="flex flex-col items-center justify-center gap-2 text-muted-foreground"
          style={{ width: w, height: h }}
        >
          <ImageOff className="h-6 w-6" />
          <span className="text-[11px]">Could not load image</span>
          <button
            type="button"
            onClick={() => setState("loading")}
            className="text-[11px] text-primary underline"
          >
            Retry
          </button>
        </div>
      )}
      <img
        src={url}
        alt="Photo"
        onLoad={() => setState("loaded")}
        onError={() => setState("error")}
        onClick={() => state === "loaded" && onOpenLightbox(url)}
        className={cn(
          "max-h-96 max-w-full cursor-zoom-in rounded-lg object-cover transition-opacity hover:opacity-95",
          state !== "loaded" && "hidden",
        )}
      />
    </div>
  );
}

function VideoBlock({
  media,
}: {
  media: Extract<MessageMedia, { kind: "video" }>;
}) {
  const [load, setLoad] = useState(false);
  const ratio = media.width && media.height ? media.width / media.height : 16 / 9;
  const w = 320;
  const h = Math.round(w / ratio);

  if (!load) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setLoad(true)}
          className="group relative flex items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/40 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          style={{ width: w, height: h }}
        >
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background/80 shadow-md">
              <Play className="h-6 w-6 fill-current" />
            </div>
            <span className="text-xs font-medium">Load video</span>
            <span className="text-[10px] opacity-70">
              {media.size ? formatBytes(media.size) : ""}
              {media.duration ? ` · ${formatDuration(media.duration)}` : ""}
            </span>
          </div>
        </button>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {media.mimeType && (
            <Badge variant="outline" className="font-mono text-[10px]">
              {media.mimeType.replace("video/", "")}
            </Badge>
          )}
          {media.width && media.height && (
            <span>
              {media.width} × {media.height}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <video
        controls
        autoPlay
        preload="metadata"
        src={media.url}
        className="max-h-96 w-full max-w-md rounded-lg bg-black"
      />
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        {media.duration && <span>{formatDuration(media.duration)}</span>}
        {media.size && <span>· {formatBytes(media.size)}</span>}
        {media.mimeType && (
          <Badge variant="outline" className="font-mono text-[10px]">
            {media.mimeType.replace("video/", "")}
          </Badge>
        )}
      </div>
    </div>
  );
}

function StickerBlock({ url }: { url: string }) {
  const [load, setLoad] = useState(false);
  if (!load) {
    return (
      <button
        type="button"
        onClick={() => setLoad(true)}
        className="flex h-32 w-32 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/40 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
      >
        <Sticker className="h-7 w-7" />
        <span className="text-[11px]">Load sticker</span>
      </button>
    );
  }
  return <img src={url} alt="Sticker" className="h-32 w-32 object-contain" />;
}

function AudioBlock({
  media,
}: {
  media: Extract<MessageMedia, { kind: "audio" | "voice" }>;
  out: boolean;
}) {
  const [load, setLoad] = useState(false);
  const Icon = media.kind === "voice" ? Mic : Music;
  if (!load) {
    return (
      <button
        type="button"
        onClick={() => setLoad(true)}
        className="flex items-center gap-3 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/40 px-3 py-2 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
      >
        <Play className="h-4 w-4 fill-current" />
        <Icon className="h-4 w-4" />
        <span className="text-xs">
          {media.kind === "voice" ? "Voice message" : "Audio"}
          {media.duration ? ` · ${formatDuration(media.duration)}` : ""}
          {media.size ? ` · ${formatBytes(media.size)}` : ""}
        </span>
      </button>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
      <Icon className="h-5 w-5 shrink-0" />
      <audio controls autoPlay src={media.url} className="h-8 max-w-[260px]" />
      <span className="text-[11px] text-muted-foreground">
        {formatDuration(media.duration)}
      </span>
    </div>
  );
}

function MediaBlock({
  media,
  out,
  onOpenLightbox,
}: {
  media: MessageMedia;
  out: boolean;
  onOpenLightbox: (url: string) => void;
}) {
  if (media.kind === "photo") {
    return (
      <PhotoBlock
        url={media.url}
        width={media.width}
        height={media.height}
        onOpenLightbox={onOpenLightbox}
      />
    );
  }

  if (media.kind === "video") return <VideoBlock media={media} />;
  if (media.kind === "sticker") return <StickerBlock url={media.url} />;
  if (media.kind === "voice" || media.kind === "audio") {
    return <AudioBlock media={media} out={out} />;
  }

  if (media.kind === "document") {
    return (
      <a
        href={`${media.url}${media.url.includes("?") ? "&" : "?"}download=1`}
        download={media.fileName}
        className={cn(
          "flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-muted/80",
          out ? "bg-primary/20" : "bg-muted",
        )}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{media.fileName}</div>
          <div className="text-[11px] text-muted-foreground">
            {formatBytes(media.size)} {media.mimeType ? `· ${media.mimeType}` : ""}
          </div>
        </div>
        <Download className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
      </a>
    );
  }

  if (media.kind === "webpage") {
    if (!media.url && !media.title) return null;
    return (
      <a
        href={media.url ?? "#"}
        target="_blank"
        rel="noreferrer"
        className="block border-l-2 border-primary pl-3 hover:opacity-80"
      >
        {media.title && <div className="text-sm font-medium">{media.title}</div>}
        {media.description && (
          <div className="line-clamp-2 text-xs text-muted-foreground">
            {media.description}
          </div>
        )}
        {media.url && (
          <div className="mt-1 truncate text-[11px] text-primary">
            {media.url}
          </div>
        )}
      </a>
    );
  }

  if (media.kind === "other") {
    return (
      <Badge variant="outline" className="text-[11px]">
        {media.label}
      </Badge>
    );
  }
  return null;
}

function ReplyPreviewBlock({
  reply,
  out,
  onJump,
}: {
  reply: NonNullable<Message["replyTo"]>;
  out: boolean;
  onJump: (id: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onJump(reply.id)}
      className={cn(
        "mb-1 flex w-full max-w-full items-start gap-2 overflow-hidden rounded-md border-l-2 px-2 py-1 text-left transition-colors",
        out
          ? "border-white/70 bg-white/10 hover:bg-white/15"
          : "border-primary bg-primary/10 hover:bg-primary/15",
      )}
      data-testid={`reply-preview-${reply.id}`}
    >
      <CornerUpLeft
        className={cn(
          "mt-0.5 h-3 w-3 shrink-0",
          out ? "text-primary-foreground/80" : "text-primary",
        )}
      />
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "truncate text-[11px] font-medium",
            out ? "text-primary-foreground" : "text-primary",
          )}
        >
          {reply.senderName ?? "Message"}
        </div>
        <div
          className={cn(
            "truncate text-[11px]",
            out ? "text-primary-foreground/80" : "text-muted-foreground",
          )}
        >
          {summarizeReply(reply.text, reply.hasMedia)}
        </div>
      </div>
    </button>
  );
}

function MessageStatus({
  msg,
  readOutboxMaxId,
}: {
  msg: Message;
  readOutboxMaxId: number | null;
}) {
  if (!msg.out) return null;
  const isRead = readOutboxMaxId != null && msg.id <= readOutboxMaxId;
  return isRead ? (
    <CheckCheck className="h-3.5 w-3.5" data-testid={`status-read-${msg.id}`} />
  ) : (
    <Check className="h-3.5 w-3.5" data-testid={`status-sent-${msg.id}`} />
  );
}

function MessageBubble({
  msg,
  showAvatar,
  showName,
  dialog,
  onReply,
  onJump,
  onOpenLightbox,
  highlight,
  registerRef,
}: {
  msg: Message;
  showAvatar: boolean;
  showName: boolean;
  dialog: Dialog;
  onReply: (m: Message) => void;
  onJump: (id: number) => void;
  onOpenLightbox: (url: string) => void;
  highlight: boolean;
  registerRef: (id: number, el: HTMLDivElement | null) => void;
}) {
  const out = msg.out;
  const isChannel = dialog.type === "channel";
  const isGroup = dialog.type === "chat";
  // Only fall back to dialog title for non-group chats (DMs/channels). In a
  // group, falling back would label every unknown message with the group name.
  const senderId = msg.fromId ?? dialog.id;
  const senderName = msg.fromName ?? (isGroup ? "Unknown" : dialog.title);
  const nameColor = senderTextColor(senderId);

  return (
    <div
      ref={(el) => registerRef(msg.id, el)}
      className={cn(
        "group flex items-end gap-2 transition-colors",
        out ? "justify-end" : "justify-start",
        highlight && "rounded-lg bg-primary/10",
      )}
    >
      {!out && !isChannel && (
        <div className={cn("w-8 shrink-0", !showAvatar && "invisible")}>
          {showAvatar && (
            <ChatAvatar
              peerId={senderId}
              title={senderName}
              hasPhoto={msg.senderHasPhoto}
              size={32}
            />
          )}
        </div>
      )}
      <div
        className={cn(
          "relative max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm",
          out
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm bg-card",
          isChannel && !out && "max-w-[85%]",
        )}
      >
        {/* Hover reply action */}
        <button
          type="button"
          onClick={() => onReply(msg)}
          aria-label="Reply"
          className={cn(
            "absolute -top-2 opacity-0 shadow-sm transition-opacity group-hover:opacity-100",
            "flex h-7 w-7 items-center justify-center rounded-full bg-card text-foreground border",
            out ? "-left-9" : "-right-9",
          )}
          data-testid={`button-reply-${msg.id}`}
        >
          <Reply className="h-3.5 w-3.5" />
        </button>

        {!out && !isChannel && showName && (
          <div
            className={cn("mb-1 text-xs font-semibold", nameColor)}
            data-testid={`sender-name-${msg.id}`}
          >
            {senderName}
          </div>
        )}

        {msg.fwdFrom && (
          <div
            className={cn(
              "mb-1 flex items-center gap-1 text-[11px] italic",
              out ? "text-primary-foreground/80" : "text-muted-foreground",
            )}
            data-testid={`forwarded-${msg.id}`}
          >
            <Forward className="h-3 w-3" />
            <span>
              Forwarded
              {msg.fwdFrom.fromName ? ` from ${msg.fwdFrom.fromName}` : ""}
            </span>
          </div>
        )}

        {msg.replyTo && (
          <ReplyPreviewBlock reply={msg.replyTo} out={out} onJump={onJump} />
        )}

        {msg.media && (
          <div className={cn("mb-1", !msg.text && "mb-0")}>
            <MediaBlock
              media={msg.media}
              out={out}
              onOpenLightbox={onOpenLightbox}
            />
          </div>
        )}
        {msg.text && (
          <div className="whitespace-pre-wrap break-words">{msg.text}</div>
        )}
        <div
          className={cn(
            "mt-1 flex items-center justify-end gap-1.5 text-[10px]",
            out ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          {msg.editDate && (
            <span
              className="flex items-center gap-0.5"
              title={`Edited ${new Date(msg.editDate * 1000).toLocaleString()}`}
              data-testid={`edited-${msg.id}`}
            >
              <Pencil className="h-2.5 w-2.5" />
              edited
            </span>
          )}
          {msg.views != null && (
            <span className="flex items-center gap-0.5">
              <Eye className="h-3 w-3" />
              {msg.views.toLocaleString()}
            </span>
          )}
          <span>{formatTime(msg.date)}</span>
          <MessageStatus msg={msg} readOutboxMaxId={dialog.readOutboxMaxId} />
        </div>
      </div>
    </div>
  );
}

function ChatHeaderSubtitle({ dialog }: { dialog: Dialog }) {
  if (dialog.type === "channel") return <>Channel</>;
  if (dialog.type === "chat") return <>Group</>;
  if (dialog.isBot) return <>Bot</>;
  const presence = formatPresence(dialog.presence);
  if (presence.label) {
    return (
      <span
        className={cn(presence.online && "text-emerald-500 dark:text-emerald-400")}
      >
        {presence.label}
      </span>
    );
  }
  return <>User</>;
}

export function MessageView({ dialog }: { dialog: Dialog }) {
  const qc = useQueryClient();
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["messages", dialog.id, dialog.type],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api.messages(dialog.id, PAGE_SIZE, pageParam || undefined),
    getNextPageParam: (last) => {
      if (last.messages.length < PAGE_SIZE) return undefined;
      const oldest = last.messages[last.messages.length - 1];
      return oldest ? oldest.id : undefined;
    },
    staleTime: 10_000,
  });

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const topSentinelRef = useRef<HTMLDivElement | null>(null);
  const didInitialScroll = useRef(false);
  const prevScrollHeight = useRef<number | null>(null);
  const messageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);

  // Reset reply target when switching chats.
  useEffect(() => {
    setReplyTo(null);
    setLightbox(null);
    setHighlightId(null);
  }, [dialog.id, dialog.type]);

  // Flatten + reverse so oldest renders at top, newest at bottom.
  const allMessages: Message[] = useMemo(
    () =>
      (data?.pages ?? [])
        .flatMap((p) => p.messages)
        .slice()
        .reverse(),
    [data],
  );

  // Scroll to bottom on first load of a chat; preserve position when prepending.
  useEffect(() => {
    didInitialScroll.current = false;
    prevScrollHeight.current = null;
  }, [dialog.id, dialog.type]);

  useLayoutEffect(() => {
    const v = viewportRef.current;
    if (!v) return;
    if (!didInitialScroll.current && allMessages.length > 0) {
      v.scrollTop = v.scrollHeight;
      didInitialScroll.current = true;
    } else if (prevScrollHeight.current != null) {
      v.scrollTop = v.scrollHeight - prevScrollHeight.current;
      prevScrollHeight.current = null;
    }
  }, [allMessages.length]);

  // Observe top sentinel: when visible, fetch older messages.
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const v = viewportRef.current;
    if (!sentinel || !v) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (e?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          prevScrollHeight.current = v.scrollHeight;
          fetchNextPage();
        }
      },
      { root: v, rootMargin: "200px 0px 0px 0px" },
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, allMessages.length]);

  // Mark chat as read when messages first load (or new ones arrive) for any
  // chat with unread messages.
  const markRead = useMutation({
    mutationFn: ({ chatId, maxId }: { chatId: string; maxId: number }) =>
      api.markRead(chatId, maxId),
  });
  useEffect(() => {
    if (dialog.unreadCount <= 0) return;
    if (allMessages.length === 0) return;
    const newest = allMessages[allMessages.length - 1];
    if (!newest) return;
    if (
      dialog.readInboxMaxId != null &&
      newest.id <= dialog.readInboxMaxId
    ) {
      return;
    }
    markRead.mutate(
      { chatId: dialog.id, maxId: newest.id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["dialogs"] });
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dialog.id,
    dialog.type,
    dialog.unreadCount,
    dialog.readInboxMaxId,
    allMessages.length,
  ]);

  const registerRef = (id: number, el: HTMLDivElement | null) => {
    if (el) messageRefs.current.set(id, el);
    else messageRefs.current.delete(id);
  };

  const handleJump = (id: number) => {
    const el = messageRefs.current.get(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightId(id);
    window.setTimeout(() => setHighlightId(null), 1500);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b bg-card/50 px-4 py-3">
        <ChatAvatar
          peerId={dialog.id}
          title={dialog.title}
          hasPhoto={dialog.hasPhoto}
          size={40}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium">{dialog.title}</span>
            {dialog.isVerified && (
              <BadgeCheck className="h-4 w-4 text-primary" />
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {dialog.username ? `@${dialog.username}` : ""}
            {dialog.username && " · "}
            <ChatHeaderSubtitle dialog={dialog} />
            {allMessages.length > 0 && (
              <span> · {allMessages.length} loaded</span>
            )}
          </div>
        </div>
        {dialog.username && (
          <Button asChild variant="ghost" size="sm">
            <a
              href={`https://t.me/${dialog.username}`}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="mr-1 h-3 w-3" />
              Open in Telegram
            </a>
          </Button>
        )}
      </div>

      <div ref={viewportRef} className="min-h-0 flex-1 overflow-y-auto bg-muted/30">
        {isLoading && (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading messages…
          </div>
        )}
        {error && (
          <div className="m-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {(error as Error).message}
          </div>
        )}
        {!isLoading && allMessages.length === 0 && !error && (
          <div className="flex h-full items-center justify-center py-20 text-sm text-muted-foreground">
            No messages
          </div>
        )}
        {allMessages.length > 0 && (
          <div className="space-y-1 px-4 py-4">
            <div ref={topSentinelRef} />
            {hasNextPage && (
              <div className="flex justify-center py-2 text-xs text-muted-foreground">
                {isFetchingNextPage ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading older messages…
                  </span>
                ) : (
                  <span>Scroll up for more</span>
                )}
              </div>
            )}
            {!hasNextPage && (
              <div className="py-2 text-center text-[11px] text-muted-foreground">
                Beginning of chat history
              </div>
            )}
            {allMessages.map((m, i) => {
              const prev = allMessages[i - 1];
              const next = allMessages[i + 1];
              const showDate =
                !prev ||
                new Date(prev.date * 1000).toDateString() !==
                  new Date(m.date * 1000).toDateString();
              // Sender name shows at the TOP of a run (first message from a
              // given sender), so compare against the previous (older) message.
              // Date separator also resets a run visually.
              const sameAsPrev =
                !showDate &&
                prev &&
                prev.fromId === m.fromId &&
                prev.out === m.out;
              const showName = !sameAsPrev;
              // Avatar shows at the BOTTOM of a run (last message from a given
              // sender), so compare against the next (newer) message.
              const sameAsNext =
                next && next.fromId === m.fromId && next.out === m.out;
              const showAvatar = !sameAsNext;
              return (
                <div key={m.id}>
                  {showDate && (
                    <div className="my-3 flex justify-center">
                      <span className="rounded-full bg-card px-3 py-1 text-[11px] text-muted-foreground shadow-sm">
                        {formatDateLabel(m.date)}
                      </span>
                    </div>
                  )}
                  <MessageBubble
                    msg={m}
                    showAvatar={showAvatar}
                    showName={showName}
                    dialog={dialog}
                    onReply={setReplyTo}
                    onJump={handleJump}
                    onOpenLightbox={setLightbox}
                    highlight={highlightId === m.id}
                    registerRef={registerRef}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Composer
        chatId={dialog.id}
        chatType={dialog.type}
        replyTo={replyTo}
        onClearReply={() => setReplyTo(null)}
      />

      {lightbox && (
        <PhotoLightbox url={lightbox} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}
