import { useState } from "react";
import { cn } from "@/lib/utils";

const COLORS = [
  "bg-rose-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-sky-500",
  "bg-violet-500",
  "bg-pink-500",
  "bg-teal-500",
  "bg-orange-500",
];

function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length]!;
}

function initials(title: string): string {
  const parts = title.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

export function ChatAvatar({
  peerId,
  title,
  hasPhoto,
  size = 48,
  className,
}: {
  peerId: string;
  title: string;
  hasPhoto: boolean;
  size?: number;
  className?: string;
}) {
  const [errored, setErrored] = useState(false);
  const showImage = hasPhoto && !errored;

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full text-white font-semibold",
        !showImage && colorFor(peerId || title),
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {showImage ? (
        <img
          src={`/api/photo/${encodeURIComponent(peerId)}`}
          alt={title}
          className="h-full w-full object-cover"
          onError={() => setErrored(true)}
          loading="lazy"
        />
      ) : (
        <span>{initials(title)}</span>
      )}
    </div>
  );
}
