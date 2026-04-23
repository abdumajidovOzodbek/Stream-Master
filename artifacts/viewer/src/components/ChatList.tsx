import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Dialog } from "@/lib/api";
import { ChatAvatar } from "./Avatar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Search, BadgeCheck, Bot, Pin } from "lucide-react";
import { cn } from "@/lib/utils";

function formatRelative(date: number): string {
  const now = Date.now() / 1000;
  const diff = now - date;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) {
    return new Date(date * 1000).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (diff < 86400 * 7) {
    return new Date(date * 1000).toLocaleDateString([], { weekday: "short" });
  }
  return new Date(date * 1000).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function typeLabel(d: Dialog): string {
  if (d.isBot) return "Bot";
  if (d.type === "channel") return "Channel";
  if (d.type === "chat") return "Group";
  return "User";
}

export function ChatList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (d: Dialog) => void;
}) {
  const [search, setSearch] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["dialogs"],
    queryFn: () => api.dialogs(150),
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    const list = data?.dialogs ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.username?.toLowerCase().includes(q),
    );
  }, [data, search]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search chats"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        {isLoading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading chats…
          </div>
        )}
        {error && (
          <div className="m-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {(error as Error).message}
          </div>
        )}
        {!isLoading && filtered.length === 0 && !error && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No chats found
          </div>
        )}
        <ul className="divide-y">
          {filtered.map((d) => {
            const selected = d.id === selectedId;
            return (
              <li key={`${d.type}-${d.id}`}>
                <button
                  type="button"
                  onClick={() => onSelect(d)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/50",
                    selected && "bg-primary/10 hover:bg-primary/15",
                  )}
                >
                  <ChatAvatar
                    peerId={d.id}
                    title={d.title}
                    hasPhoto={d.hasPhoto}
                    size={48}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">
                        {d.title}
                      </span>
                      {d.isVerified && (
                        <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
                      )}
                      {d.isBot && (
                        <Bot className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      {d.isPinned && (
                        <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />
                      )}
                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                        {d.lastMessage ? formatRelative(d.lastMessage.date) : ""}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <p className="truncate text-xs text-muted-foreground">
                        {d.lastMessage?.out && (
                          <span className="text-foreground/60">You: </span>
                        )}
                        {d.lastMessage?.text || (
                          <span className="italic">{typeLabel(d)}</span>
                        )}
                      </p>
                      {d.unreadCount > 0 && (
                        <Badge className="ml-auto h-5 min-w-5 shrink-0 rounded-full px-1.5 text-[10px]">
                          {d.unreadCount > 99 ? "99+" : d.unreadCount}
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </ScrollArea>
    </div>
  );
}
