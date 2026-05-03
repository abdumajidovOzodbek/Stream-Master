import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api, type Dialog, type Message, type MessageMedia, type Reaction } from "@/lib/api";
import { ChatAvatar, senderTextColor } from "./Avatar";
import { Composer } from "./Composer";
import { PhotoLightbox } from "./PhotoLightbox";
import { MessageContextMenu } from "./MessageContextMenu";
import { UserProfileCard } from "./UserProfileCard";
import { SharedMediaPanel } from "./SharedMediaPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  Pause,
  Sticker,
  Reply,
  CornerUpLeft,
  Forward,
  Pencil,
  Check,
  CheckCheck,
  Search,
  X,
  Images,
  Smile,
  ArrowLeft,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPresence, summarizeReply } from "@/lib/format";

const PAGE_SIZE = 50;
const COMMON_REACTIONS = ["👍", "❤️", "🔥", "🥰", "👏", "😁", "🤔", "😢"];

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function formatBytes(b: number | null): string {
  if (!b) return "";
  const u = ["B", "KB", "MB", "GB"];
  let v = b, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${u[i]}`;
}

function formatDuration(s: number | null): string {
  if (!s) return "";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function formatTime(t: number): string {
  return new Date(t * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateLabel(t: number): string {
  const d = new Date(t * 1000);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Voice waveform
// ---------------------------------------------------------------------------

// Static placeholder bars shown before audio is loaded (looks like a real waveform)
const STATIC_BARS = Array.from({ length: 48 }, (_, i) =>
  Math.min(1, Math.max(0.06, 0.5 + Math.sin(i * 0.7) * 0.28 + Math.sin(i * 1.9 + 1) * 0.16)),
);

function VoiceWaveform({ url, duration, out }: { url: string; duration: number | null; out: boolean }) {
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [bars, setBars] = useState<number[]>([]);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const N = 48;

  // Colour scheme adapts to bubble type
  const btnCls = out
    ? "bg-white/25 text-white hover:bg-white/35"
    : "bg-primary/15 text-primary hover:bg-primary/20";
  const timeCls = out ? "text-primary-foreground/65" : "text-muted-foreground";

  async function load() {
    setLoadState("loading");
    try {
      const res = await fetch(url);
      const ab = await res.arrayBuffer();
      const ctx = new AudioContext();
      const audioBuf = await ctx.decodeAudioData(ab);
      const data = audioBuf.getChannelData(0);
      const step = Math.ceil(data.length / N);
      const raw: number[] = [];
      for (let i = 0; i < N; i++) {
        let sum = 0;
        for (let j = 0; j < step; j++) sum += Math.abs(data[i * step + j] ?? 0);
        raw.push(sum / step);
      }
      const max = Math.max(...raw, 0.001);
      setBars(raw.map((b) => b / max));
      setLoadState("ready");
      await ctx.close();
    } catch {
      setLoadState("error");
    }
  }

  function tick() {
    const a = audioRef.current;
    if (a && a.duration) setProgress(a.currentTime / a.duration);
    rafRef.current = requestAnimationFrame(tick);
  }

  function togglePlay() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setPlaying(false);
    } else {
      void a.play();
      rafRef.current = requestAnimationFrame(tick);
      setPlaying(true);
    }
  }

  function seek(e: React.MouseEvent<SVGSVGElement>) {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    a.currentTime = pct * a.duration;
    setProgress(pct);
  }

  useEffect(() => {
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  if (loadState === "idle") {
    return (
      <button
        type="button"
        onClick={() => void load()}
        className="flex items-center gap-2.5 py-0.5 transition-opacity hover:opacity-80"
      >
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors", btnCls)}>
          <Play className="h-4 w-4 translate-x-px fill-current" />
        </div>
        <div className="flex min-w-[120px] flex-col gap-0.5">
          <div className="flex h-8 items-end gap-px">
            {STATIC_BARS.map((h, i) => (
              <span
                key={i}
                className={cn("w-[2px] rounded-[1px]", out ? "bg-white/30" : "bg-muted-foreground/25")}
                style={{ height: `${Math.round(h * 24)}px` }}
              />
            ))}
          </div>
          {duration != null && (
            <span className={cn("text-[10px]", timeCls)}>{formatDuration(duration)}</span>
          )}
        </div>
      </button>
    );
  }

  if (loadState === "loading") {
    return (
      <div className="flex items-center gap-2.5 py-0.5">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", btnCls)}>
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
        <span className={cn("text-xs", timeCls)}>Decoding…</span>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="flex items-center gap-2 py-0.5 text-xs text-destructive">
        <Mic className="h-4 w-4" /> Could not load voice message
      </div>
    );
  }

  const W = 180;
  const H = 32;

  return (
    <div className="flex items-center gap-2.5 py-0.5">
      <audio
        ref={audioRef}
        src={url}
        preload="auto"
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
        }}
        className="hidden"
      />
      <button
        type="button"
        onClick={togglePlay}
        className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-80", btnCls)}
      >
        {playing
          ? <Pause className="h-4 w-4 fill-current" />
          : <Play className="h-4 w-4 translate-x-px fill-current" />}
      </button>
      <div className="flex min-w-[120px] flex-col gap-0.5">
        <svg
          width={W}
          height={H}
          className="cursor-pointer"
          onClick={seek}
        >
          {bars.map((amp, i) => {
            const barW = 2;
            const gap = (W - N * barW) / (N - 1);
            const x = i * (barW + gap);
            const barH = Math.max(2, amp * H);
            const y = (H - barH) / 2;
            const filled = i / N <= progress;
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx={1}
                className={filled
                  ? (out ? "fill-white/90" : "fill-primary")
                  : (out ? "fill-white/30" : "fill-muted-foreground/30")}
              />
            );
          })}
        </svg>
        <span className={cn("text-[10px]", timeCls)}>
          {formatDuration(Math.round((audioRef.current?.currentTime ?? 0))) || formatDuration(duration)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Photo
// ---------------------------------------------------------------------------

function PhotoBlock({
  url, width, height, onOpenLightbox,
}: {
  url: string; width: number | null; height: number | null;
  onOpenLightbox: (url: string) => void;
}) {
  const [load, setLoad] = useState(false);
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const ratio = width && height ? width / height : 4 / 3;
  // Cap at 240px wide so it fits inside mobile bubbles (max-w-[90%] of ~360px screen)
  const w = 240;
  const h = Math.min(Math.round(w / ratio), 200);

  if (!load) {
    return (
      <button
        type="button"
        onClick={() => setLoad(true)}
        className="group flex w-full max-w-[240px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-muted-foreground/30 bg-muted/40 py-4 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        style={{ height: h }}
      >
        <ImageIcon className="h-6 w-6" />
        <span className="text-[11px] font-medium">Tap to load photo</span>
        {width && height && (
          <span className="text-[10px] opacity-60">{width} × {height}</span>
        )}
      </button>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl bg-black/5 dark:bg-white/5">
      {state === "loading" && (
        <div className="flex items-center justify-center" style={{ width: w, height: h }}>
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {state === "error" && (
        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground" style={{ width: w, height: h }}>
          <ImageOff className="h-6 w-6" />
          <span className="text-[11px]">Could not load image</span>
          <button type="button" onClick={() => setState("loading")} className="text-[11px] text-primary underline">
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
          "max-h-72 max-w-full cursor-zoom-in rounded-xl object-cover transition-opacity hover:opacity-95",
          state !== "loaded" && "hidden",
        )}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Video
// ---------------------------------------------------------------------------

function VideoBlock({ media }: { media: Extract<MessageMedia, { kind: "video" }> }) {
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
          {media.width && media.height && <span>{media.width} × {media.height}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <video controls autoPlay preload="metadata" src={media.url} className="max-h-96 w-full max-w-md rounded-lg bg-black" />
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

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

function AudioBlock({ media, out }: { media: Extract<MessageMedia, { kind: "audio" | "voice" }>; out: boolean }) {
  if (media.kind === "voice") {
    return <VoiceWaveform url={media.url} duration={media.duration} out={out} />;
  }
  const [load, setLoad] = useState(false);
  if (!load) {
    return (
      <button
        type="button"
        onClick={() => setLoad(true)}
        className="flex items-center gap-3 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/40 px-3 py-2 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
      >
        <Play className="h-4 w-4 fill-current" />
        <Music className="h-4 w-4" />
        <span className="text-xs">
          Audio{media.duration ? ` · ${formatDuration(media.duration)}` : ""}
          {media.size ? ` · ${formatBytes(media.size)}` : ""}
        </span>
      </button>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
      <Music className="h-5 w-5 shrink-0" />
      <audio controls autoPlay src={media.url} className="h-8 max-w-[260px]" />
      <span className="text-[11px] text-muted-foreground">{formatDuration(media.duration)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sticker
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Media dispatcher
// ---------------------------------------------------------------------------

function MediaBlock({
  media, out, onOpenLightbox,
}: {
  media: MessageMedia; out: boolean; onOpenLightbox: (url: string) => void;
}) {
  if (media.kind === "photo") {
    return <PhotoBlock url={media.url} width={media.width} height={media.height} onOpenLightbox={onOpenLightbox} />;
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
          <div className="line-clamp-2 text-xs text-muted-foreground">{media.description}</div>
        )}
        {media.url && (
          <div className="mt-1 truncate text-[11px] text-primary">{media.url}</div>
        )}
      </a>
    );
  }
  if (media.kind === "other") {
    return <Badge variant="outline" className="text-[11px]">{media.label}</Badge>;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Reply preview
// ---------------------------------------------------------------------------

function ReplyPreviewBlock({
  reply, out, onJump,
}: {
  reply: NonNullable<Message["replyTo"]>; out: boolean; onJump: (id: number) => void;
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
    >
      <CornerUpLeft className={cn("mt-0.5 h-3 w-3 shrink-0", out ? "text-primary-foreground/80" : "text-primary")} />
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className={cn("line-clamp-1 text-[11px] font-medium", out ? "text-primary-foreground" : "text-primary")}>
          {reply.senderName ?? "Message"}
        </div>
        <div className={cn("line-clamp-1 text-[11px]", out ? "text-primary-foreground/80" : "text-muted-foreground")}>
          {summarizeReply(reply.text, reply.hasMedia)}
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Read status
// ---------------------------------------------------------------------------

function MessageStatus({ msg, readOutboxMaxId }: { msg: Message; readOutboxMaxId: number | null }) {
  if (!msg.out) return null;
  const isRead = readOutboxMaxId != null && msg.id <= readOutboxMaxId;
  return isRead ? (
    <CheckCheck className="h-3.5 w-3.5" />
  ) : (
    <Check className="h-3.5 w-3.5" />
  );
}

// ---------------------------------------------------------------------------
// Reaction chips
// ---------------------------------------------------------------------------

function ReactionChips({
  reactions: reactionsProp, chatId, msgId, out,
}: {
  reactions: Reaction[] | undefined; chatId: string; msgId: number; out: boolean;
}) {
  const reactions = reactionsProp ?? [];
  const [showPicker, setShowPicker] = useState(false);
  const qc = useQueryClient();

  const toggle = useMutation({
    mutationFn: ({ emoji, chosen }: { emoji: string; chosen: boolean }) =>
      api.setReaction(chatId, msgId, chosen ? null : emoji),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["messages"] });
    },
  });

  if (reactions.length === 0 && !showPicker) {
    return (
      <button
        type="button"
        onClick={() => setShowPicker(true)}
        className={cn(
          "mt-1 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] opacity-0 group-hover:opacity-100 transition-opacity",
          out
            ? "bg-white/10 text-primary-foreground/70 hover:bg-white/20"
            : "bg-muted text-muted-foreground hover:bg-muted/80",
        )}
      >
        <Smile className="h-3 w-3" />
      </button>
    );
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => toggle.mutate({ emoji: r.emoji, chosen: r.chosen })}
          disabled={toggle.isPending}
          className={cn(
            "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors",
            r.chosen
              ? out
                ? "bg-white/20 text-primary-foreground"
                : "bg-primary/15 text-primary ring-1 ring-primary/30"
              : out
                ? "bg-white/10 text-primary-foreground/80 hover:bg-white/20"
                : "bg-muted text-foreground hover:bg-muted/80",
          )}
        >
          <span>{r.emoji}</span>
          <span className="text-[10px] font-medium">{r.count}</span>
        </button>
      ))}
      <button
        type="button"
        onClick={() => setShowPicker(!showPicker)}
        className={cn(
          "flex items-center rounded-full px-1.5 py-0.5 text-[11px] transition-colors",
          out
            ? "bg-white/10 text-primary-foreground/70 hover:bg-white/20"
            : "bg-muted text-muted-foreground hover:bg-muted/80",
        )}
      >
        <Smile className="h-3 w-3" />
      </button>
      {showPicker && (
        <div className={cn(
          "absolute z-20 mt-1 flex gap-1 rounded-xl border bg-card p-2 shadow-lg",
          out ? "right-0" : "left-0",
        )} style={{ bottom: "100%" }}>
          {COMMON_REACTIONS.map((emoji) => {
            const existing = reactions.find((r) => r.emoji === emoji);
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  toggle.mutate({ emoji, chosen: !!existing?.chosen });
                  setShowPicker(false);
                }}
                className={cn(
                  "rounded-lg p-1.5 text-lg transition-colors hover:bg-muted",
                  existing?.chosen && "bg-primary/10",
                )}
              >
                {emoji}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// OG link preview card
// ---------------------------------------------------------------------------

const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/i;

function OgCard({ url, out }: { url: string; out: boolean }) {
  const { data } = useQuery({
    queryKey: ["og", url],
    queryFn: () => api.ogData(url),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    enabled: URL_REGEX.test(url),
  });
  if (!data?.title) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "mt-1.5 block overflow-hidden rounded-lg border text-left no-underline transition-opacity hover:opacity-90",
        out ? "border-white/20 bg-white/10" : "border-border bg-muted/50",
      )}
    >
      {data.image && (
        <img
          src={data.image}
          alt=""
          className="max-h-36 w-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      )}
      <div className="p-2">
        <div className={cn("text-[12px] font-semibold leading-snug", out ? "text-primary-foreground" : "text-foreground")}>
          {data.title}
        </div>
        {data.description && (
          <div className={cn("mt-0.5 line-clamp-2 text-[11px] leading-snug", out ? "text-primary-foreground/70" : "text-muted-foreground")}>
            {data.description}
          </div>
        )}
        <div className={cn("mt-1 truncate text-[10px]", out ? "text-primary-foreground/50" : "text-muted-foreground/60")}>
          {new URL(url).hostname}
        </div>
      </div>
    </a>
  );
}

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

function MessageBubble({
  msg, showAvatar, showName, dialog, onReply, onJump, onOpenLightbox,
  highlight, registerRef, onAvatarClick,
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
  onAvatarClick: (senderId: string) => void;
}) {
  const out = msg.out;
  const isChannel = dialog.type === "channel";
  const isGroup = dialog.type === "chat";
  const senderId = msg.fromId ?? dialog.id;
  const senderName = msg.fromName ?? (isGroup ? "Unknown" : dialog.title);
  const nameColor = senderTextColor(senderId);

  // Inline-footer mode: timestamp floats inline with text (Telegram-style).
  // Disabled for messages that have an OG link card (card is full-width so footer goes below).
  const hasOgCard = !!(msg.text && !msg.media && msg.text.match(URL_REGEX));
  const useInlineFooter = !!msg.text && !hasOgCard;

  // Footer content shared by both inline and block layouts
  const footerItems = (
    <>
      {msg.editDate && (
        <span
          className="flex shrink-0 items-center gap-0.5"
          title={`Edited ${new Date(msg.editDate * 1000).toLocaleString()}`}
        >
          <Pencil className="h-2.5 w-2.5" />
          <span>edited</span>
        </span>
      )}
      {msg.views != null && (
        <span className="flex shrink-0 items-center gap-0.5">
          <Eye className="h-3 w-3" />
          {msg.views.toLocaleString()}
        </span>
      )}
      <span className="shrink-0">{formatTime(msg.date)}</span>
      <MessageStatus msg={msg} readOutboxMaxId={dialog.readOutboxMaxId} />
    </>
  );

  const footerCls = cn(
    "flex shrink-0 items-center gap-1 whitespace-nowrap text-[10px] leading-tight select-none",
    out ? "text-primary-foreground/75" : "text-muted-foreground/90",
  );

  return (
    <MessageContextMenu msg={msg} dialog={dialog} onReply={onReply}>
      <div
        ref={(el) => registerRef(msg.id, el)}
        className={cn(
          "group flex items-end gap-2 transition-colors",
          out ? "justify-end" : "justify-start",
          highlight && "rounded-lg bg-primary/10",
        )}
      >
        {/* Sender avatar (shown at bottom of each run) */}
        {!out && !isChannel && (
          <div className={cn("w-8 shrink-0", !showAvatar && "invisible")}>
            {showAvatar && (
              <button
                type="button"
                onClick={() => onAvatarClick(senderId)}
                className="rounded-full transition-opacity hover:opacity-80"
              >
                <ChatAvatar
                  peerId={senderId}
                  title={senderName}
                  hasPhoto={msg.senderHasPhoto}
                  size={32}
                />
              </button>
            )}
          </div>
        )}

        {/* Bubble — max-w lives on the outer div so it correctly constrains against the row */}
        <div
          className={cn(
            "relative min-w-0 max-w-[88%] overflow-hidden sm:max-w-[72%]",
            isChannel && !out && "sm:max-w-[82%]",
          )}
        >
          <div
            className={cn(
              // min-w ensures very short messages ("Hi", "ok") always have room
              // for the timestamp + status footer without wrapping.
              "relative min-w-[108px] overflow-hidden rounded-2xl px-3.5 py-2 text-sm",
              out
                ? "rounded-br-sm bubble-out text-primary-foreground"
                : "rounded-bl-sm bubble-in",
            )}
          >
            {/* Hover reply button */}
            <button
              type="button"
              onClick={() => onReply(msg)}
              aria-label="Reply"
              className={cn(
                "absolute -top-2 opacity-0 shadow-sm transition-opacity group-hover:opacity-100",
                "flex h-7 w-7 items-center justify-center rounded-full bg-card text-foreground border",
                out ? "-left-9" : "-right-9",
              )}
            >
              <Reply className="h-3.5 w-3.5" />
            </button>

            {/* Sender name (top of run) — truncated so long names don't wrap */}
            {!out && !isChannel && showName && (
              <div className={cn("mb-1 max-w-[160px] truncate text-[11px] font-semibold leading-tight", nameColor)}>
                {senderName}
              </div>
            )}

            {/* Forwarded badge */}
            {msg.fwdFrom && (
              <div
                className={cn(
                  "mb-1 flex items-center gap-1 text-[11px] italic",
                  out ? "text-primary-foreground/80" : "text-muted-foreground",
                )}
              >
                <Forward className="h-3 w-3" />
                <span>
                  Forwarded{msg.fwdFrom.fromName ? ` from ${msg.fwdFrom.fromName}` : ""}
                </span>
              </div>
            )}

            {/* Reply preview */}
            {msg.replyTo && (
              <ReplyPreviewBlock reply={msg.replyTo} out={out} onJump={onJump} />
            )}

            {/* Media */}
            {msg.media && (
              <div className={cn("mb-1", !msg.text && "mb-0")}>
                <MediaBlock media={msg.media} out={out} onOpenLightbox={onOpenLightbox} />
              </div>
            )}

            {/* Text — with invisible trailing spacer when inline-footer is active.
                The spacer reserves bottom-right space so the absolute timestamp
                never overlaps real text (same trick Telegram Web uses). */}
            {msg.text && (
              <div className="whitespace-pre-wrap leading-[1.45] [overflow-wrap:anywhere]">
                {msg.text}
                {useInlineFooter && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none inline-block h-[13px] w-[76px] select-none align-bottom"
                  />
                )}
              </div>
            )}

            {/* Link preview (OG card) — only when no media and URL found in text */}
            {msg.text && !msg.media && (() => {
              const match = msg.text.match(URL_REGEX);
              return match ? <OgCard url={match[0]} out={out} /> : null;
            })()}

            {/* Fallback for messages with no text and no renderable media */}
            {!msg.text && !msg.media && (
              <span className={cn("text-xs italic", out ? "text-primary-foreground/60" : "text-muted-foreground/70")}>
                Unsupported message
              </span>
            )}

            {/* Footer — inline (absolute) when there is text, block otherwise */}
            {useInlineFooter ? (
              <div className={cn("absolute bottom-2 right-3.5", footerCls)}>
                {footerItems}
              </div>
            ) : (
              <div className={cn("mt-1 justify-end", footerCls)}>
                {footerItems}
              </div>
            )}
          </div>

          {/* Reaction chips (outside bubble so they don't affect max-w) */}
          <div className={cn("relative flex", out ? "justify-end" : "justify-start")}>
            <ReactionChips
              reactions={msg.reactions}
              chatId={dialog.id}
              msgId={msg.id}
              out={out}
            />
          </div>
        </div>
      </div>
    </MessageContextMenu>
  );
}

// ---------------------------------------------------------------------------
// Chat header subtitle
// ---------------------------------------------------------------------------

function ChatHeaderSubtitle({ dialog }: { dialog: Dialog }) {
  if (dialog.type === "channel") return <>Channel</>;
  if (dialog.type === "chat") return <>Group</>;
  if (dialog.isBot) return <>Bot</>;
  const presence = formatPresence(dialog.presence);
  if (presence.label) {
    return (
      <span className={cn(presence.online && "text-emerald-500 dark:text-emerald-400")}>
        {presence.label}
      </span>
    );
  }
  return <>User</>;
}

// ---------------------------------------------------------------------------
// Search panel
// ---------------------------------------------------------------------------

function SearchPanel({
  dialog,
  onJump,
  onClose,
}: {
  dialog: Dialog;
  onJump: (id: number) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 400);

  const { data, isLoading } = useQuery({
    queryKey: ["search", dialog.id, debouncedQ],
    queryFn: () => api.searchMessages(dialog.id, debouncedQ, 20),
    enabled: debouncedQ.length >= 2,
    staleTime: 30_000,
  });

  const results = data?.messages ?? [];

  return (
    <div className="border-b bg-card/80 px-4 py-2 shadow-sm">
      <div className="relative flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search in chat…"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {results.length > 0 && (
        <ul className="mt-2 max-h-48 overflow-y-auto divide-y rounded-lg border bg-card text-sm shadow-sm">
          {results.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => { onJump(m.id); onClose(); }}
                className="flex w-full flex-col px-3 py-2 text-left hover:bg-muted/50"
              >
                <span className="text-[10px] text-muted-foreground">
                  {m.fromName ?? "Unknown"} · {formatTime(m.date)}
                </span>
                <span className="truncate">{m.text || "Media"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {debouncedQ.length >= 2 && !isLoading && results.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground">No messages found</p>
      )}
    </div>
  );
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

// ---------------------------------------------------------------------------
// Main MessageView
// ---------------------------------------------------------------------------

export function MessageView({ dialog, onBack, stealthMode }: { dialog: Dialog; onBack?: () => void; stealthMode?: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ["messages", dialog.id, dialog.type],
      initialPageParam: 0,
      queryFn: ({ pageParam }) =>
        api.messages(dialog.id, PAGE_SIZE, pageParam || undefined),
      getNextPageParam: (last) => {
        if (last.messages.length < PAGE_SIZE) return undefined;
        const oldest = last.messages[last.messages.length - 1];
        return oldest ? oldest.id : undefined;
      },
      staleTime: 8_000,
      refetchInterval: 8_000,
    });

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const topSentinelRef = useRef<HTMLDivElement | null>(null);
  const didInitialScroll = useRef(false);
  const prevScrollHeight = useRef<number | null>(null);
  const messageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showSharedMedia, setShowSharedMedia] = useState(false);
  const [profilePeerId, setProfilePeerId] = useState<string | null>(null);

  // Keyboard: Ctrl+F to toggle search
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setShowSearch((v) => !v);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Reset state on chat switch
  useEffect(() => {
    setReplyTo(null);
    setLightbox(null);
    setHighlightId(null);
    setShowSearch(false);
    setShowSharedMedia(false);
    didInitialScroll.current = false;
    prevScrollHeight.current = null;
  }, [dialog.id, dialog.type]);

  const allMessages: Message[] = useMemo(
    () => (data?.pages ?? []).flatMap((p) => p.messages).slice().reverse(),
    [data],
  );

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

  // Mark as read (skipped in stealth mode)
  const markRead = useMutation({
    mutationFn: ({ chatId, maxId }: { chatId: string; maxId: number }) =>
      api.markRead(chatId, maxId),
  });
  useEffect(() => {
    if (stealthMode) return;
    if (dialog.unreadCount <= 0) return;
    if (allMessages.length === 0) return;
    const newest = allMessages[allMessages.length - 1];
    if (!newest) return;
    if (dialog.readInboxMaxId != null && newest.id <= dialog.readInboxMaxId) return;
    markRead.mutate(
      { chatId: dialog.id, maxId: newest.id },
      { onSuccess: () => { void qc.invalidateQueries({ queryKey: ["dialogs"] }); } },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stealthMode, dialog.id, dialog.type, dialog.unreadCount, dialog.readInboxMaxId, allMessages.length]);

  const registerRef = useCallback((id: number, el: HTMLDivElement | null) => {
    if (el) messageRefs.current.set(id, el);
    else messageRefs.current.delete(id);
  }, []);

  const handleJump = useCallback((id: number) => {
    const el = messageRefs.current.get(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightId(id);
    window.setTimeout(() => setHighlightId(null), 1500);
  }, []);

  return (
    <div className="flex h-full min-w-0 flex-1">
      {/* Main chat column */}
      <div className="flex h-full min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 border-b glass px-2 py-2 md:gap-3 md:px-4 md:py-3 sticky top-0 z-10">
          {/* Back button — mobile only */}
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="h-10 w-10 shrink-0 md:hidden"
              aria-label="Back to chats"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}

          <ChatAvatar
            peerId={dialog.id}
            title={dialog.title}
            hasPhoto={dialog.hasPhoto}
            size={38}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span className="truncate text-sm font-semibold md:text-base">{dialog.title}</span>
              {dialog.isVerified && <BadgeCheck className="h-4 w-4 shrink-0 text-primary" />}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              <ChatHeaderSubtitle dialog={dialog} />
            </div>
          </div>

          {/* Header actions */}
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              title="Search in chat (Ctrl+F)"
              onClick={() => setShowSearch((v) => !v)}
              className={cn("h-10 w-10", showSearch && "bg-primary/10 text-primary")}
            >
              <Search className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Shared media"
              onClick={() => setShowSharedMedia((v) => !v)}
              className={cn("h-10 w-10", showSharedMedia && "bg-primary/10 text-primary")}
            >
              <Images className="h-4 w-4" />
            </Button>
            {dialog.username && (
              <Button asChild variant="ghost" size="icon" className="hidden sm:flex">
                <a href={`https://t.me/${dialog.username}`} target="_blank" rel="noreferrer"
                  title="Open in Telegram">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            )}
          </div>
        </div>

        {/* Search panel */}
        {showSearch && (
          <SearchPanel
            dialog={dialog}
            onJump={handleJump}
            onClose={() => setShowSearch(false)}
          />
        )}

        {/* Messages */}
        <div ref={viewportRef} className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto chat-bg">
          {/* Unread jump button */}
          {dialog.unreadCount > 0 && allMessages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const v = viewportRef.current;
                if (v) v.scrollTo({ top: v.scrollHeight, behavior: "smooth" });
              }}
              className="jump-bounce absolute bottom-4 right-4 z-10 flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-lg"
            >
              ↓ {dialog.unreadCount} unread
            </button>
          )}

          {isLoading && (
            <div className="flex items-center justify-center py-20">
              <div className="flex items-center gap-2 rounded-full bg-card/90 px-4 py-2 shadow-sm backdrop-blur-sm border border-border/50">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Loading messages…</span>
              </div>
            </div>
          )}
          {error && (
            <div className="m-4 rounded-xl border border-destructive/40 bg-card/90 p-3 text-sm text-destructive backdrop-blur-sm">
              {(error as Error).message}
            </div>
          )}
          {!isLoading && allMessages.length === 0 && !error && (
            <div className="flex h-full items-center justify-center py-20">
              <div className="flex flex-col items-center gap-3 rounded-2xl bg-card/90 px-8 py-6 shadow-sm backdrop-blur-sm border border-border/50">
                <MessageSquare className="h-9 w-9 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No messages yet</p>
              </div>
            </div>
          )}

          {allMessages.length > 0 && (
            <div className="space-y-0 px-2 py-3 sm:px-4 sm:py-4">
              <div ref={topSentinelRef} />
              {hasNextPage && (
                <div className="flex justify-center py-2">
                  {isFetchingNextPage ? (
                    <span className="flex items-center gap-2 rounded-full bg-card/90 px-3.5 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur-sm border border-border/50">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading older messages…
                    </span>
                  ) : (
                    <span className="rounded-full bg-card/90 px-3.5 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur-sm border border-border/50">
                      Scroll up for more
                    </span>
                  )}
                </div>
              )}
              {!hasNextPage && (
                <div className="flex justify-center py-2">
                  <span className="rounded-full bg-card/90 px-3.5 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur-sm border border-border/50">
                    Beginning of conversation
                  </span>
                </div>
              )}

              {allMessages.map((m, i) => {
                const prev = allMessages[i - 1];
                const next = allMessages[i + 1];
                const showDate =
                  !prev ||
                  new Date(prev.date * 1000).toDateString() !==
                    new Date(m.date * 1000).toDateString();
                const sameAsPrev =
                  !showDate && prev && prev.fromId === m.fromId && prev.out === m.out;
                const showName = !sameAsPrev;
                const sameAsNext =
                  next && next.fromId === m.fromId && next.out === m.out;
                const showAvatar = !sameAsNext;

                return (
                  <div
                    key={m.id}
                    className={cn(
                      "msg-row",
                      i === 0 ? "mt-0" : sameAsPrev ? "mt-0.5" : "mt-2.5",
                    )}
                  >
                    {showDate && (
                      <div className="my-4 flex justify-center">
                        <span className="rounded-full bg-card/90 px-3.5 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur-sm border border-border/50">
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
                      onAvatarClick={setProfilePeerId}
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
      </div>

      {/* Shared media side panel */}
      {showSharedMedia && (
        <SharedMediaPanel
          dialog={dialog}
          onClose={() => setShowSharedMedia(false)}
          onOpenLightbox={setLightbox}
        />
      )}

      {/* Lightbox */}
      {lightbox && <PhotoLightbox url={lightbox} onClose={() => setLightbox(null)} />}

      {/* User profile card */}
      <UserProfileCard
        peerId={profilePeerId}
        peerDialog={dialog.type === "user" && profilePeerId === dialog.id ? dialog : null}
        open={profilePeerId !== null}
        onClose={() => setProfilePeerId(null)}
      />
    </div>
  );
}
