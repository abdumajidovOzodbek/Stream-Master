import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { useDebounce } from "@/hooks/use-debounce";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api, type Dialog, type Message, type MessageMedia, type Reaction, type PollInfo, type BotCommand } from "@/lib/api";
import { ChatAvatar, senderTextColor } from "./Avatar";
import { Composer } from "./Composer";
import { PhotoLightbox } from "./PhotoLightbox";
import { MessageContextMenu } from "./MessageContextMenu";
import { UserProfileCard } from "./UserProfileCard";
import { SharedMediaPanel } from "./SharedMediaPanel";
import { ChatStats } from "./ChatStats";
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
  BarChart2,
  Trash2,
  Pin,
  PinOff,
  Terminal,
  CalendarDays,
  UserPlus,
  UserMinus,
  Volume2,
  VolumeX,
  AlertTriangle,
  ChevronDown,
} from "lucide-react";
import {
  Dialog as UiDialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatPresence, summarizeReply } from "@/lib/format";
import { onTypingChange, getTypingNames } from "@/lib/typingStore";

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
        className="flex min-h-[44px] items-center gap-2.5 py-1 transition-opacity hover:opacity-80"
      >
        {/* 44px play button */}
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors", btnCls)}>
          <Play className="h-5 w-5 translate-x-px fill-current" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex h-8 items-end gap-px overflow-hidden">
            {STATIC_BARS.map((h, i) => (
              <span
                key={i}
                className={cn("w-[2px] shrink-0 rounded-[1px]", out ? "bg-white/30" : "bg-muted-foreground/25")}
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
      <div className="flex min-h-[44px] items-center gap-2.5 py-1">
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full", btnCls)}>
          <Loader2 className="h-5 w-5 animate-spin" />
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
      {/* 44px touch target for play/pause */}
      <button
        type="button"
        onClick={togglePlay}
        className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-80", btnCls)}
      >
        {playing
          ? <Pause className="h-5 w-5 fill-current" />
          : <Play className="h-5 w-5 translate-x-px fill-current" />}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <svg
          width="100%"
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
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
  // Cap at 240px wide; use fluid width so it never overflows narrow screens
  const maxW = 240;
  const h = Math.min(Math.round(maxW / ratio), 200);

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
    <div className="relative w-full max-w-[240px] overflow-hidden rounded-xl bg-black/5 dark:bg-white/5">
      {state === "loading" && (
        <div className="flex w-full max-w-[240px] items-center justify-center" style={{ height: h }}>
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {state === "error" && (
        <div className="flex w-full max-w-[240px] flex-col items-center justify-center gap-2 text-muted-foreground" style={{ height: h }}>
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
  // Use CSS aspect-ratio so the placeholder scales correctly on narrow screens
  const aspectRatio = `${ratio}`;

  if (!load) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setLoad(true)}
          className="group relative flex w-full max-w-[320px] items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/40 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          style={{ aspectRatio }}
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
      <video controls autoPlay preload="metadata" src={media.url} className="max-h-96 w-full max-w-[320px] rounded-lg bg-black" />
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
      <audio controls autoPlay src={media.url} className="h-8 w-full max-w-[260px]" />
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
        className="flex h-28 w-full max-w-[112px] flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/40 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
      >
        <Sticker className="h-7 w-7" />
        <span className="text-[11px]">Load sticker</span>
      </button>
    );
  }
  return <img src={url} alt="Sticker" className="h-auto w-full max-w-[112px] object-contain" />;
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
// Poll
// ---------------------------------------------------------------------------

function PollBlock({ poll, chatId, msgId, out }: { poll: PollInfo; chatId: string; msgId: number; out: boolean }) {
  const qc = useQueryClient();
  const vote = useMutation({
    mutationFn: (optionIndex: number) => api.votePoll(chatId, msgId, optionIndex),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["messages"] }); },
  });
  const totalVoters = poll.totalVoters || 1;
  const hasVoted = poll.options.some((o) => o.chosen);
  const maxVoters = Math.max(...poll.options.map((o) => o.voters), 1);

  return (
    <div className={cn("rounded-xl p-3 space-y-2.5", out ? "bg-white/10" : "bg-muted/60")}>
      <div className={cn("text-sm font-semibold leading-snug", out ? "text-primary-foreground" : "text-foreground")}>
        {poll.question}
      </div>
      {poll.quiz && (
        <div className={cn("text-[11px] font-medium", out ? "text-primary-foreground/60" : "text-muted-foreground")}>
          Quiz
        </div>
      )}
      <div className="space-y-1.5">
        {poll.options.map((opt, i) => {
          const pct = hasVoted ? Math.round((opt.voters / totalVoters) * 100) : 0;
          const isLeading = opt.voters === maxVoters && opt.voters > 0;
          return (
            <button
              key={i}
              type="button"
              onClick={() => { if (!poll.closed && !hasVoted) vote.mutate(i); }}
              disabled={poll.closed || hasVoted || vote.isPending}
              className={cn(
                "relative w-full overflow-hidden rounded-lg px-3 py-2 text-left transition-colors",
                poll.closed || hasVoted ? "cursor-default" : "hover:bg-primary/10 active:bg-primary/15",
                opt.chosen
                  ? out ? "bg-white/20 ring-1 ring-white/40" : "bg-primary/15 ring-1 ring-primary/30"
                  : out ? "bg-white/10" : "bg-background/60",
              )}
            >
              {hasVoted && (
                <div
                  className={cn("absolute inset-y-0 left-0 rounded-lg transition-all", out ? "bg-white/15" : "bg-primary/10")}
                  style={{ width: `${pct}%` }}
                />
              )}
              <div className="relative flex items-center justify-between gap-2">
                <span className={cn("text-[13px]", out ? "text-primary-foreground" : "text-foreground")}>
                  {opt.text}
                </span>
                {hasVoted && (
                  <span className={cn("shrink-0 text-[11px] font-medium", isLeading ? (out ? "text-white" : "text-primary") : out ? "text-primary-foreground/60" : "text-muted-foreground")}>
                    {pct}%
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      <div className={cn("text-[11px]", out ? "text-primary-foreground/60" : "text-muted-foreground")}>
        {poll.totalVoters} vote{poll.totalVoters !== 1 ? "s" : ""}
        {poll.closed && " · closed"}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Album (media grid for grouped messages)
// ---------------------------------------------------------------------------

function AlbumGrid({
  msgs, out, onOpenLightbox,
}: {
  msgs: Message[]; out: boolean; onOpenLightbox: (url: string) => void;
}) {
  const photos = msgs.filter((m) => m.media?.kind === "photo" || m.media?.kind === "video");
  if (photos.length === 0) return null;
  const cols = photos.length <= 2 ? photos.length : Math.min(3, Math.ceil(Math.sqrt(photos.length)));
  return (
    <div
      className="grid gap-0.5 overflow-hidden rounded-xl"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, maxWidth: 280 }}
    >
      {photos.map((m) => {
        if (m.media?.kind === "photo") {
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onOpenLightbox((m.media as Extract<MessageMedia, { kind: "photo" }>).url)}
              className="aspect-square overflow-hidden bg-black/10 hover:opacity-90 transition-opacity"
            >
              <img src={(m.media as { url: string }).url} alt="Album photo" className="h-full w-full object-cover" />
            </button>
          );
        }
        if (m.media?.kind === "video") {
          return (
            <div key={m.id} className="aspect-square overflow-hidden bg-black/30 relative flex items-center justify-center">
              <Play className="h-8 w-8 text-white/80 drop-shadow" />
            </div>
          );
        }
        return null;
      })}
    </div>
  );
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
      // expand-hit-area pseudo-element makes the invisible tap area ≥44×44px
      <button
        type="button"
        onClick={() => setShowPicker(true)}
        className={cn(
          "expand-hit-area mt-1 flex items-center justify-center gap-0.5 rounded-full px-2.5 py-1.5 text-[11px]",
          "opacity-0 group-hover:opacity-100 transition-opacity",
          out
            ? "bg-white/10 text-primary-foreground/70 hover:bg-white/20"
            : "bg-muted text-muted-foreground hover:bg-muted/80",
        )}
      >
        <Smile className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {reactions.map((r) => (
        // expand-hit-area gives a ≥44px invisible tap zone while the pill stays visually compact
        <button
          key={r.emoji}
          type="button"
          onClick={() => toggle.mutate({ emoji: r.emoji, chosen: r.chosen })}
          disabled={toggle.isPending}
          className={cn(
            "expand-hit-area flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs transition-colors",
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
          "expand-hit-area flex items-center rounded-full px-2.5 py-1.5 text-[11px] transition-colors",
          out
            ? "bg-white/10 text-primary-foreground/70 hover:bg-white/20"
            : "bg-muted text-muted-foreground hover:bg-muted/80",
        )}
      >
        <Smile className="h-3.5 w-3.5" />
      </button>
      {showPicker && (
        <div className={cn(
          "absolute z-20 mt-1 flex gap-0.5 rounded-xl border bg-card p-2 shadow-lg",
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
                  // expand-hit-area ensures ≥44px tap zone on touch devices
                  "expand-hit-area rounded-lg p-2 text-xl transition-colors hover:bg-muted active:scale-95",
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
  highlight, registerRef, onAvatarClick, onEdit, onDelete, onForward, onPin,
  albumPeers,
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
  onEdit: (m: Message) => void;
  onDelete: (m: Message) => void;
  onForward: (m: Message) => void;
  onPin: (m: Message) => void;
  albumPeers: Message[];
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

  const isAlbumLeader = msg.groupedId != null && albumPeers.length > 1 && albumPeers[0]?.id === msg.id;
  const isAlbumFollower = msg.groupedId != null && albumPeers.length > 1 && albumPeers[0]?.id !== msg.id;

  return (
    <MessageContextMenu msg={msg} dialog={dialog} onReply={onReply} onEdit={onEdit} onDelete={onDelete} onForward={onForward} onPin={onPin}>
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
            {/* Hover reply button — 44px touch target */}
            <button
              type="button"
              onClick={() => onReply(msg)}
              aria-label="Reply"
              className={cn(
                "absolute -top-1 opacity-0 shadow-sm transition-opacity group-hover:opacity-100",
                "flex h-11 w-11 items-center justify-center rounded-full bg-card text-foreground border",
                out ? "-left-12" : "-right-12",
              )}
            >
              <Reply className="h-4 w-4" />
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

            {/* Album grid — only on album leader, shows all grouped messages' photos/videos */}
            {isAlbumLeader && (
              <div className="mb-1">
                <AlbumGrid msgs={albumPeers} out={out} onOpenLightbox={onOpenLightbox} />
              </div>
            )}

            {/* Poll */}
            {msg.poll && !isAlbumFollower && (
              <div className="mb-1">
                <PollBlock poll={msg.poll} chatId={dialog.id} msgId={msg.id} out={out} />
              </div>
            )}

            {/* Media — skip for album followers (they're shown in leader's AlbumGrid) */}
            {msg.media && !isAlbumLeader && !isAlbumFollower && (
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

function ChatHeaderSubtitle({ dialog, typingNames }: { dialog: Dialog; typingNames: string[] }) {
  // Typing indicator takes priority over presence — mirrors official Telegram UX
  if (typingNames.length > 0) {
    const label =
      typingNames.length === 1
        ? `${typingNames[0]} is typing`
        : typingNames.length === 2
          ? `${typingNames[0]} and ${typingNames[1]} are typing`
          : `${typingNames.length} people are typing`;
    return (
      <span className="flex items-center gap-1 text-emerald-500 dark:text-emerald-400">
        {label}
        <span className="typing-dots">
          <span>.</span><span>.</span><span>.</span>
        </span>
      </span>
    );
  }

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


// ---------------------------------------------------------------------------
// Delete confirm dialog
// ---------------------------------------------------------------------------

function DeleteConfirmDialog({
  msg, chatId, open, onClose,
}: {
  msg: Message | null; chatId: string; open: boolean; onClose: () => void;
}) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: () => api.deleteMessage(chatId, msg!.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["messages", chatId] });
      onClose();
    },
  });
  return (
    <UiDialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" /> Delete message?
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This action cannot be undone. The message will be deleted for everyone.
        </p>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={del.isPending}>Cancel</Button>
          <Button variant="destructive" onClick={() => del.mutate()} disabled={del.isPending}>
            {del.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </UiDialog>
  );
}

// ---------------------------------------------------------------------------
// Forward dialog
// ---------------------------------------------------------------------------

function ForwardDialog({
  msg, fromChatId, open, onClose,
}: {
  msg: Message | null; fromChatId: string; open: boolean; onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["dialogs"],
    queryFn: () => api.dialogs(100),
    staleTime: 30_000,
  });
  const forward = useMutation({
    mutationFn: (toChatId: string) => api.forwardMessage(fromChatId, toChatId, [msg!.id]),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["dialogs"] });
      onClose();
    },
  });
  const dialogs = (data?.dialogs ?? []).filter(
    (d) => d.title.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <UiDialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Forward className="h-5 w-5" /> Forward message
          </DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Search chats…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-1"
          autoFocus
        />
        <div className="max-h-64 overflow-y-auto space-y-0.5 -mx-1">
          {dialogs.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => forward.mutate(d.id)}
              disabled={forward.isPending}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted/60 transition-colors"
            >
              <ChatAvatar peerId={d.id} title={d.title} hasPhoto={d.hasPhoto} size={36} />
              <span className="truncate text-sm">{d.title}</span>
              {forward.isPending && <Loader2 className="ml-auto h-4 w-4 animate-spin text-muted-foreground" />}
            </button>
          ))}
        </div>
      </DialogContent>
    </UiDialog>
  );
}

// ---------------------------------------------------------------------------
// Bot command panel
// ---------------------------------------------------------------------------

function BotCommandPanel({
  chatId, onCommand, onClose,
}: {
  chatId: string; onCommand: (cmd: string) => void; onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["bot-commands", chatId],
    queryFn: () => api.botCommands(chatId),
    staleTime: 60_000,
  });
  const commands = data ?? [];
  return (
    <div className="border-t bg-card/90 backdrop-blur-sm">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
          <Terminal className="h-3.5 w-3.5" /> Bot Commands
        </span>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      {isLoading && <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>}
      {!isLoading && commands.length === 0 && (
        <p className="py-3 text-center text-xs text-muted-foreground">No commands available</p>
      )}
      <div className="max-h-48 overflow-y-auto divide-y">
        {commands.map((cmd: BotCommand) => (
          <button
            key={cmd.command}
            type="button"
            onClick={() => { onCommand(`/${cmd.command}`); onClose(); }}
            className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
          >
            <span className="shrink-0 font-mono text-sm text-primary">/{cmd.command}</span>
            <span className="truncate text-xs text-muted-foreground">{cmd.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pinned message banner
// ---------------------------------------------------------------------------

function PinnedBanner({
  chatId, onJump,
}: {
  chatId: string; onJump: (id: number) => void;
}) {
  const [visible, setVisible] = useState(true);
  const { data } = useQuery({
    queryKey: ["pinned", chatId],
    queryFn: () => api.pinnedMessages(chatId),
    staleTime: 60_000,
  });
  const pinned = data ?? [];
  if (!visible || pinned.length === 0) return null;
  const latest = pinned[0]!;
  return (
    <div className="border-b bg-amber-50/80 dark:bg-amber-950/30 px-3 py-2 flex items-center gap-2 backdrop-blur-sm">
      <Pin className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
      <button
        type="button"
        onClick={() => onJump(latest.id)}
        className="min-w-0 flex-1 text-left"
      >
        <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">Pinned message</div>
        <div className="truncate text-xs text-amber-700/80 dark:text-amber-300/80">
          {latest.text || (latest.media ? "Media" : "Message")}
        </div>
      </button>
      <button
        type="button"
        onClick={() => setVisible(false)}
        className="shrink-0 text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
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
      // SSE handles real-time delivery. Poll at 30 s as fallback (e.g. after
      // a brief SSE reconnect gap or if the connection is not yet established).
      staleTime: 30_000,
      refetchInterval: 30_000,
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
  const [showStats, setShowStats] = useState(false);
  const [profilePeerId, setProfilePeerId] = useState<string | null>(null);
  const [typingNames, setTypingNames] = useState<string[]>(() => getTypingNames(dialog.id));

  // Edit / Delete / Forward / Pin
  const [editMsg, setEditMsg] = useState<Message | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null);
  const [forwardTarget, setForwardTarget] = useState<Message | null>(null);

  // Jump to date
  const [showJumpDate, setShowJumpDate] = useState(false);
  const [jumpDate, setJumpDate] = useState("");

  // Bot command panel
  const [showBotCommands, setShowBotCommands] = useState(false);
  const [composerCommand, setComposerCommand] = useState<string | null>(null);

  // Muted state (local UI toggle — reflects notification state)
  const [muted, setMuted] = useState(false);

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

  // Reset state on chat switch + subscribe to typing events
  useEffect(() => {
    setReplyTo(null);
    setLightbox(null);
    setHighlightId(null);
    setShowSearch(false);
    setShowSharedMedia(false);
    setShowStats(false);
    setEditMsg(null);
    setDeleteTarget(null);
    setForwardTarget(null);
    setShowJumpDate(false);
    setJumpDate("");
    setShowBotCommands(false);
    setComposerCommand(null);
    didInitialScroll.current = false;
    prevScrollHeight.current = null;
    // Seed typing names for the newly opened chat, then subscribe
    setTypingNames(getTypingNames(dialog.id));
    return onTypingChange(dialog.id, setTypingNames);
  }, [dialog.id, dialog.type]);

  const allMessages: Message[] = useMemo(
    () => (data?.pages ?? []).flatMap((p) => p.messages).slice().reverse(),
    [data],
  );

  // Build album groups: map from groupedId → sorted Message[]
  const albumGroups = useMemo(() => {
    const groups = new Map<string, Message[]>();
    for (const m of allMessages) {
      if (!m.groupedId) continue;
      const arr = groups.get(m.groupedId) ?? [];
      arr.push(m);
      groups.set(m.groupedId, arr);
    }
    return groups;
  }, [allMessages]);

  // Pin handler
  const pinMut = useMutation({
    mutationFn: (m: Message) => api.pinMessage(dialog.id, m.id, m.pinned),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["messages", dialog.id] });
      void qc.invalidateQueries({ queryKey: ["pinned", dialog.id] });
    },
  });

  // Jump to date handler
  const jumpToDateMut = useMutation({
    mutationFn: (dateStr: string) => {
      const ts = Math.floor(new Date(dateStr).getTime() / 1000);
      return api.messageNearDate(dialog.id, ts);
    },
    onSuccess: (result) => {
      setShowJumpDate(false);
      setJumpDate("");
      if (result.msgId) {
        const existing = messageRefs.current.get(result.msgId);
        if (existing) {
          handleJump(result.msgId);
        }
      }
    },
  });

  // Mute handler
  const muteMut = useMutation({
    mutationFn: (m: boolean) => api.muteChat(dialog.id, m),
    onSuccess: (_, m) => setMuted(m),
  });

  // Join / Leave handlers
  const joinMut = useMutation({
    mutationFn: () => api.joinChat(dialog.id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["dialogs"] }); },
  });
  const leaveMut = useMutation({
    mutationFn: () => api.leaveChat(dialog.id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["dialogs"] }); },
  });

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
        <div className="flex items-center gap-2 border-b glass px-2 py-1.5 md:gap-3 md:px-4 md:py-2 sticky top-0 z-10">
          {/* Back button — mobile only, 44px touch target */}
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="h-11 w-11 shrink-0 md:hidden"
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
              <ChatHeaderSubtitle dialog={dialog} typingNames={typingNames} />
            </div>
          </div>

          {/* Header actions — 44px touch targets */}
          <div className="flex shrink-0 items-center gap-0.5">
            {/* Jump to date */}
            <Button
              variant="ghost"
              size="icon"
              title="Jump to date"
              onClick={() => setShowJumpDate((v) => !v)}
              className={cn("hidden sm:flex h-11 w-11", showJumpDate && "bg-primary/10 text-primary")}
            >
              <CalendarDays className="h-4 w-4" />
            </Button>

            {/* Mute / unmute */}
            <Button
              variant="ghost"
              size="icon"
              title={muted ? "Unmute notifications" : "Mute notifications"}
              onClick={() => muteMut.mutate(!muted)}
              disabled={muteMut.isPending}
              className={cn("hidden sm:flex h-11 w-11", muted && "text-muted-foreground/50")}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>

            {/* Join / Leave for groups/channels */}
            {(dialog.type === "chat" || dialog.type === "channel") && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Join"
                  onClick={() => joinMut.mutate()}
                  disabled={joinMut.isPending || leaveMut.isPending}
                  className="hidden sm:flex h-11 w-11 text-emerald-500 hover:text-emerald-600"
                >
                  {joinMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Leave"
                  onClick={() => leaveMut.mutate()}
                  disabled={joinMut.isPending || leaveMut.isPending}
                  className="hidden sm:flex h-11 w-11 text-destructive hover:text-destructive/80"
                >
                  {leaveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
                </Button>
              </>
            )}

            {/* Bot commands (show only for bots or when chat has bot) */}
            {(dialog.isBot || dialog.type === "chat") && (
              <Button
                variant="ghost"
                size="icon"
                title="Bot commands"
                onClick={() => setShowBotCommands((v) => !v)}
                className={cn("hidden sm:flex h-11 w-11", showBotCommands && "bg-primary/10 text-primary")}
              >
                <Terminal className="h-4 w-4" />
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              title="Search in chat (Ctrl+F)"
              onClick={() => setShowSearch((v) => !v)}
              className={cn("h-11 w-11", showSearch && "bg-primary/10 text-primary")}
            >
              <Search className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Shared media"
              onClick={() => { setShowSharedMedia((v) => !v); setShowStats(false); }}
              className={cn("h-11 w-11", showSharedMedia && "bg-primary/10 text-primary")}
            >
              <Images className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Chat analytics"
              onClick={() => { setShowStats((v) => !v); setShowSharedMedia(false); }}
              className={cn("h-11 w-11", showStats && "bg-primary/10 text-primary")}
            >
              <BarChart2 className="h-4 w-4" />
            </Button>
            {dialog.username && (
              <Button asChild variant="ghost" size="icon" className="hidden sm:flex h-11 w-11">
                <a href={`https://t.me/${dialog.username}`} target="_blank" rel="noreferrer"
                  title="Open in Telegram">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            )}
          </div>
        </div>

        {/* Jump to date panel */}
        {showJumpDate && (
          <div className="border-b bg-card/80 px-4 py-2.5 flex items-center gap-3 backdrop-blur-sm">
            <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              type="date"
              value={jumpDate}
              onChange={(e) => setJumpDate(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className="flex-1 bg-transparent text-sm outline-none"
            />
            <Button
              size="sm"
              onClick={() => { if (jumpDate) jumpToDateMut.mutate(jumpDate); }}
              disabled={!jumpDate || jumpToDateMut.isPending}
            >
              {jumpToDateMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Jump"}
            </Button>
            <button type="button" onClick={() => { setShowJumpDate(false); setJumpDate(""); }} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Pinned message banner */}
        <PinnedBanner chatId={dialog.id} onJump={handleJump} />

        {/* Search panel */}
        {showSearch && (
          <SearchPanel
            dialog={dialog}
            onJump={handleJump}
            onClose={() => setShowSearch(false)}
          />
        )}

        {/* Bot command panel */}
        {showBotCommands && (
          <BotCommandPanel
            chatId={dialog.id}
            onCommand={(cmd) => setComposerCommand(cmd)}
            onClose={() => setShowBotCommands(false)}
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

                // For album followers, only render the bubble but visually hidden — so
                // they register their ref for jump-to but don't show duplicate content.
                const albumPeers = m.groupedId ? (albumGroups.get(m.groupedId) ?? [m]) : [m];
                const isAlbumFollower = m.groupedId != null && albumPeers.length > 1 && albumPeers[0]?.id !== m.id;

                return (
                  <div
                    key={m.id}
                    className={cn(
                      "msg-row",
                      isAlbumFollower ? "hidden" : (i === 0 ? "mt-0" : sameAsPrev ? "mt-0.5" : "mt-2.5"),
                    )}
                  >
                    {!isAlbumFollower && showDate && (
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
                      onEdit={setEditMsg}
                      onDelete={setDeleteTarget}
                      onForward={setForwardTarget}
                      onPin={(msg) => pinMut.mutate(msg)}
                      albumPeers={albumPeers}
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
          editMsg={editMsg}
          onClearEdit={() => setEditMsg(null)}
          injectedText={composerCommand}
          onClearInjectedText={() => setComposerCommand(null)}
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

      {/* Chat analytics side panel */}
      {showStats && (
        <ChatStats
          dialog={dialog}
          onClose={() => setShowStats(false)}
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

      {/* Delete confirm dialog */}
      <DeleteConfirmDialog
        msg={deleteTarget}
        chatId={dialog.id}
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
      />

      {/* Forward dialog */}
      <ForwardDialog
        msg={forwardTarget}
        fromChatId={dialog.id}
        open={forwardTarget !== null}
        onClose={() => setForwardTarget(null)}
      />
    </div>
  );
}
