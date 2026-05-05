import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Dialog, type SubscriberEntry } from "@/lib/api";
import { ChatAvatar } from "./Avatar";
import { X, Loader2, Search, Users, Crown, ShieldCheck, Bot, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";

const PAGE_SIZE = 100;

function RoleBadge({ role }: { role: SubscriberEntry["role"] }) {
  if (role === "creator") {
    return (
      <span className="flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
        <Crown className="h-2.5 w-2.5" />
        Owner
      </span>
    );
  }
  if (role === "admin") {
    return (
      <span className="flex items-center gap-0.5 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-900/40 dark:text-sky-400">
        <ShieldCheck className="h-2.5 w-2.5" />
        Admin
      </span>
    );
  }
  return null;
}

export function SubscriberRow({
  sub,
  onAvatarClick,
}: {
  sub: SubscriberEntry;
  onAvatarClick: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
      onClick={() => onAvatarClick(sub.id)}
    >
      <ChatAvatar
        peerId={sub.id}
        title={sub.name}
        hasPhoto={sub.hasPhoto}
        size={34}
        className="shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium leading-tight">{sub.name}</span>
          {sub.isBot && (
            <Bot className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
        </div>
        {sub.username && (
          <div className="truncate text-[11px] text-muted-foreground">
            @{sub.username}
          </div>
        )}
      </div>
      <RoleBadge role={sub.role} />
    </button>
  );
}

interface Props {
  dialog: Dialog;
  onClose: () => void;
  onOpenProfile: (peerId: string) => void;
}

export function SubscribersPanel({ dialog, onClose, onOpenProfile }: Props) {
  const [rawSearch, setRawSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [allLoaded, setAllLoaded] = useState<SubscriberEntry[]>([]);
  const [hasMore, setHasMore] = useState(true);

  const search = useDebounce(rawSearch, 300);

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["subscribers", dialog.id, search, offset],
    queryFn: async () => {
      const result = await api.subscribers(dialog.id, PAGE_SIZE, offset, search);
      if (offset === 0) {
        setAllLoaded(result.subscribers);
      } else {
        setAllLoaded((prev) => {
          const ids = new Set(prev.map((s) => s.id));
          return [...prev, ...result.subscribers.filter((s) => !ids.has(s.id))];
        });
      }
      setHasMore(result.subscribers.length >= PAGE_SIZE);
      return result;
    },
    staleTime: 30_000,
  });

  const handleSearch = useCallback((v: string) => {
    setRawSearch(v);
    setOffset(0);
    setAllLoaded([]);
    setHasMore(true);
  }, []);

  const loadMore = useCallback(() => {
    setOffset((o) => o + PAGE_SIZE);
  }, []);

  const total = data?.total ?? null;
  const broadcastOnly = data?.broadcastOnly ?? false;

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-l bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">
            {dialog.type === "channel" ? "Subscribers" : "Members"}
            {total !== null && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                ({total.toLocaleString()})
              </span>
            )}
          </span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Search */}
      {!broadcastOnly && (
        <div className="border-b px-2 py-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={rawSearch}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search members…"
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-1.5">
        {isLoading && allLoaded.length === 0 && (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {broadcastOnly && (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <Lock className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium">Subscriber list is private</p>
            <p className="text-xs text-muted-foreground">
              Telegram does not expose the subscriber list for broadcast channels.
              {total !== null && total > 0 && (
                <> This channel has <strong>{total.toLocaleString()}</strong> subscribers.</>
              )}
            </p>
          </div>
        )}

        {error && !broadcastOnly && (
          <div className="px-3 py-6 text-center text-xs text-destructive">
            {(error as Error).message}
          </div>
        )}

        {!isLoading && !error && !broadcastOnly && allLoaded.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No members found
          </div>
        )}

        {!broadcastOnly && (
          <div className="space-y-0.5">
            {allLoaded.map((sub) => (
              <SubscriberRow
                key={sub.id}
                sub={sub}
                onAvatarClick={onOpenProfile}
              />
            ))}
          </div>
        )}

        {!error && !broadcastOnly && hasMore && allLoaded.length > 0 && (
          <button
            type="button"
            onClick={loadMore}
            disabled={isFetching}
            className={cn(
              "mt-2 w-full rounded-md py-2 text-xs text-primary hover:underline disabled:opacity-50",
            )}
          >
            {isFetching ? (
              <span className="flex items-center justify-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading…
              </span>
            ) : (
              "Load more"
            )}
          </button>
        )}
      </div>
    </div>
  );
}
