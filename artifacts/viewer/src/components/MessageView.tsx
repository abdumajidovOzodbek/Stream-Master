import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api, type Dialog, type Message, type MessageMedia } from "@/lib/api";
import { ChatAvatar } from "./Avatar";
import { Composer } from "./Composer";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

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
}: {
  url: string;
  width: number | null;
  height: number | null;
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
        className={cn(
          "max-h-96 max-w-full rounded-lg object-cover",
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
  return (
    <img
      src={url}
      alt="Sticker"
      className="h-32 w-32 object-contain"
    />
  );
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

function MediaBlock({ media, out }: { media: MessageMedia; out: boolean }) {
  if (media.kind === "photo") {
    return (
      <PhotoBlock url={media.url} width={media.width} height={media.height} />
    );
  }

  if (media.kind === "video") {
    return <VideoBlock media={media} />;
  }

  if (media.kind === "sticker") {
    return <StickerBlock url={media.url} />;
  }

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

function MessageBubble({
  msg,
  showAvatar,
  dialog,
}: {
  msg: Message;
  showAvatar: boolean;
  dialog: Dialog;
}) {
  const out = msg.out;
  const isChannel = dialog.type === "channel";
  const senderId = msg.fromId ?? dialog.id;
  const senderName = msg.fromName ?? dialog.title;

  return (
    <div
      className={cn(
        "flex items-end gap-2",
        out ? "justify-end" : "justify-start",
      )}
    >
      {!out && !isChannel && (
        <div className={cn("w-8 shrink-0", !showAvatar && "invisible")}>
          {showAvatar && (
            <ChatAvatar
              peerId={senderId}
              title={senderName}
              hasPhoto={false}
              size={32}
            />
          )}
        </div>
      )}
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm",
          out
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm bg-card",
          isChannel && !out && "max-w-[85%]",
        )}
      >
        {!out && !isChannel && showAvatar && (
          <div className="mb-1 text-xs font-medium text-primary">
            {senderName}
          </div>
        )}
        {msg.media && (
          <div className={cn("mb-1", !msg.text && "mb-0")}>
            <MediaBlock media={msg.media} out={out} />
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
          {msg.views != null && (
            <span className="flex items-center gap-0.5">
              <Eye className="h-3 w-3" />
              {msg.views.toLocaleString()}
            </span>
          )}
          <span>{formatTime(msg.date)}</span>
        </div>
      </div>
    </div>
  );
}

export function MessageView({ dialog }: { dialog: Dialog }) {
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

  // Flatten + reverse so oldest renders at top, newest at bottom.
  const allMessages: Message[] = (data?.pages ?? [])
    .flatMap((p) => p.messages)
    .slice()
    .reverse();

  // Scroll to bottom on first load of a chat.
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
      // We just prepended older messages — preserve visual position.
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
            {dialog.type === "channel"
              ? "Channel"
              : dialog.type === "chat"
                ? "Group"
                : dialog.isBot
                  ? "Bot"
                  : "User"}
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
              const showDate =
                !prev ||
                new Date(prev.date * 1000).toDateString() !==
                  new Date(m.date * 1000).toDateString();
              const sameSender =
                prev && prev.fromId === m.fromId && prev.out === m.out;
              const showAvatar = !sameSender;
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
                    dialog={dialog}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Composer chatId={dialog.id} chatType={dialog.type} />
    </div>
  );
}
