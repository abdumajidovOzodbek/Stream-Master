import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api, type Dialog, type Message } from "@/lib/api";
import { X, Loader2, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type MediaTab = "photos" | "videos" | "files";

const TABS: { key: MediaTab; label: string }[] = [
  { key: "photos", label: "Photos" },
  { key: "videos", label: "Videos" },
  { key: "files", label: "Files" },
];

function isPhoto(m: Message) {
  return m.media?.kind === "photo";
}
function isVideo(m: Message) {
  return m.media?.kind === "video";
}
function isFile(m: Message) {
  return m.media?.kind === "document";
}

function PhotoThumb({
  url,
  onClick,
}: {
  url: string;
  onClick: () => void;
}) {
  const [errored, setErrored] = useState(false);
  if (errored) {
    return (
      <div className="flex h-24 items-center justify-center rounded-lg bg-muted">
        <ImageOff className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative overflow-hidden rounded-lg bg-muted"
    >
      <img
        src={url}
        alt="Photo"
        className="h-24 w-full object-cover transition-opacity group-hover:opacity-90"
        onError={() => setErrored(true)}
        loading="lazy"
      />
    </button>
  );
}

interface Props {
  dialog: Dialog;
  onClose: () => void;
  onOpenLightbox: (url: string) => void;
}

export function SharedMediaPanel({ dialog, onClose, onOpenLightbox }: Props) {
  const [tab, setTab] = useState<MediaTab>("photos");

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ["messages", dialog.id, dialog.type],
      initialPageParam: 0,
      queryFn: ({ pageParam }) =>
        api.messages(dialog.id, 50, pageParam || undefined),
      getNextPageParam: (last) => {
        if (last.messages.length < 50) return undefined;
        const oldest = last.messages[last.messages.length - 1];
        return oldest ? oldest.id : undefined;
      },
      staleTime: 10_000,
    });

  const allMessages = (data?.pages ?? []).flatMap((p) => p.messages);

  const filtered = allMessages.filter((m) => {
    if (tab === "photos") return isPhoto(m);
    if (tab === "videos") return isVideo(m);
    if (tab === "files") return isFile(m);
    return false;
  });

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-l bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-3">
        <span className="text-sm font-semibold">Shared Media</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b px-2 py-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "flex-1 rounded-md py-1 text-xs font-medium transition-colors",
              tab === t.key
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No {tab} found
          </div>
        )}

        {tab === "photos" && (
          <div className="grid grid-cols-2 gap-1">
            {filtered.map((m) => {
              const media = m.media as Extract<typeof m.media, { kind: "photo" }>;
              return (
                <PhotoThumb
                  key={m.id}
                  url={media.url}
                  onClick={() => onOpenLightbox(media.url)}
                />
              );
            })}
          </div>
        )}

        {tab === "videos" && (
          <div className="space-y-2">
            {filtered.map((m) => {
              const media = m.media as Extract<typeof m.media, { kind: "video" }>;
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-2 rounded-lg border bg-muted/30 p-2 text-xs"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    🎬
                  </div>
                  <div className="min-w-0">
                    <div className="text-muted-foreground">
                      {media.width && media.height
                        ? `${media.width}×${media.height}`
                        : "Video"}
                    </div>
                    {media.duration && (
                      <div className="text-[10px] text-muted-foreground/60">
                        {Math.floor(media.duration / 60)}:{String(media.duration % 60).padStart(2, "0")}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "files" && (
          <div className="space-y-2">
            {filtered.map((m) => {
              const media = m.media as Extract<typeof m.media, { kind: "document" }>;
              return (
                <a
                  key={m.id}
                  href={`${media.url}?download=1`}
                  download={media.fileName}
                  className="flex items-center gap-2 rounded-lg border bg-muted/30 p-2 text-xs transition-colors hover:bg-muted/60"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary text-lg">
                    📎
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{media.fileName}</div>
                    {media.size && (
                      <div className="text-[10px] text-muted-foreground">
                        {(media.size / 1024 / 1024).toFixed(1)} MB
                      </div>
                    )}
                  </div>
                </a>
              );
            })}
          </div>
        )}

        {hasNextPage && (
          <button
            type="button"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
            className="mt-2 w-full rounded-md py-2 text-xs text-primary hover:underline disabled:opacity-50"
          >
            {isFetchingNextPage ? "Loading more…" : "Load older messages"}
          </button>
        )}
      </div>
    </div>
  );
}
