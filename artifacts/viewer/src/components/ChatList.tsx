import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Dialog } from "@/lib/api";
import { ChatAvatar } from "./Avatar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Search, BadgeCheck, Bot, Pin, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

type FilterTab = "all" | "unread" | "groups" | "channels" | "bots";

const TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "groups", label: "Groups" },
  { key: "channels", label: "Channels" },
  { key: "bots", label: "Bots" },
];

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

interface ChatListProps {
  selectedId: string | null;
  onSelect: (d: Dialog) => void;
}

/** Debounce a value by `delay` ms */
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export const ChatList = forwardRef<HTMLInputElement, ChatListProps>(
  function ChatList({ selectedId, onSelect }, searchRef) {
    const [search, setSearch] = useState("");
    const [tab, setTab] = useState<FilterTab>("all");
    const debouncedSearch = useDebounce(search.trim(), 400);

    const { data, isLoading, error } = useQuery({
      queryKey: ["dialogs"],
      queryFn: () => api.dialogs(150),
      staleTime: 15_000,
      refetchInterval: 15_000,
    });

    // Global Telegram search — fires only when there's a debounced query
    const {
      data: globalResults,
      isLoading: isSearching,
      error: searchError,
    } = useQuery({
      queryKey: ["contacts-search", debouncedSearch],
      queryFn: () => api.searchContacts(debouncedSearch, 25),
      enabled: debouncedSearch.length >= 2,
      staleTime: 30_000,
    });

    const allDialogs = data?.dialogs ?? [];

    // IDs already in our dialog list — used to de-duplicate global results
    const dialogIdSet = useMemo(
      () => new Set(allDialogs.map((d) => d.id)),
      [allDialogs],
    );

    const filtered = useMemo(() => {
      let list = allDialogs;

      if (search.trim()) {
        const q = search.toLowerCase();
        list = list.filter(
          (d) =>
            d.title.toLowerCase().includes(q) ||
            d.username?.toLowerCase().includes(q),
        );
      }

      if (tab === "unread") list = list.filter((d) => d.unreadCount > 0);
      else if (tab === "groups") list = list.filter((d) => d.type === "chat");
      else if (tab === "channels") list = list.filter((d) => d.type === "channel");
      else if (tab === "bots") list = list.filter((d) => d.isBot);

      return list;
    }, [allDialogs, search, tab]);

    // Global results that aren't already in our dialog list
    const newGlobalResults = useMemo(() => {
      if (!globalResults) return [];
      return globalResults.filter((d) => !dialogIdSet.has(d.id));
    }, [globalResults, dialogIdSet]);

    const pinned = filtered.filter((d) => d.isPinned);
    const regular = filtered.filter((d) => !d.isPinned);

    const unreadCounts: Record<FilterTab, number> = useMemo(() => ({
      all: allDialogs.reduce((s, d) => s + d.unreadCount, 0),
      unread: allDialogs.filter((d) => d.unreadCount > 0).length,
      groups: allDialogs.filter((d) => d.type === "chat" && d.unreadCount > 0).reduce((s, d) => s + d.unreadCount, 0),
      channels: allDialogs.filter((d) => d.type === "channel" && d.unreadCount > 0).reduce((s, d) => s + d.unreadCount, 0),
      bots: allDialogs.filter((d) => d.isBot && d.unreadCount > 0).reduce((s, d) => s + d.unreadCount, 0),
    }), [allDialogs]);

    const showGlobalSection = debouncedSearch.length >= 2;

    return (
      <div className="flex h-full flex-col">
        {/* Search */}
        <div className="border-b px-3 py-2.5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              placeholder="Search chats or find anyone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 rounded-full pl-8.5 text-sm"
            />
            {(isSearching || (search.trim() !== debouncedSearch && search.trim().length >= 2)) && (
              <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Filter tabs — hide while searching globally */}
        {!showGlobalSection && (
          <div
            className="flex shrink-0 gap-1 overflow-x-auto border-b px-3 py-2"
            style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
          >
            {TABS.map((t) => {
              const count = unreadCounts[t.key];
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={cn(
                    // Min 44px touch target height
                    "flex shrink-0 items-center gap-1 rounded-full px-3.5 py-2.5 text-sm font-medium transition-all duration-150",
                    "min-h-[44px]",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/80",
                  )}
                >
                  {t.label}
                  {count > 0 && !active && (
                    <span className="ml-0.5 min-w-[18px] rounded-full bg-primary/15 px-1 text-[11px] leading-[18px] text-primary">
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

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

          {/* ---- Local results ---- */}
          {!isLoading && filtered.length === 0 && !showGlobalSection && !error && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No chats found
            </div>
          )}

          {pinned.length > 0 && (
            <>
              <div className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Pinned
              </div>
              <ul>
                {pinned.map((d) => (
                  <ChatRow
                    key={`${d.type}-${d.id}`}
                    d={d}
                    selected={d.id === selectedId}
                    onSelect={onSelect}
                  />
                ))}
              </ul>
              {regular.length > 0 && (
                <div className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                  All chats
                </div>
              )}
            </>
          )}

          <ul>
            {regular.map((d) => (
              <ChatRow
                key={`${d.type}-${d.id}`}
                d={d}
                selected={d.id === selectedId}
                onSelect={onSelect}
              />
            ))}
          </ul>

          {/* ---- Global Telegram search results ---- */}
          {showGlobalSection && (
            <>
              {/* Header row */}
              <div className="flex items-center gap-1.5 px-3 pb-0.5 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                <Globe className="h-3 w-3" />
                Telegram search
              </div>

              {searchError && (
                <div className="mx-3 my-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                  Search failed: {(searchError as Error).message}
                </div>
              )}

              {isSearching && (
                <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Searching…
                </div>
              )}

              {!isSearching && !searchError && newGlobalResults.length === 0 && (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No results found on Telegram
                </div>
              )}

              <ul>
                {newGlobalResults.map((d) => (
                  <ChatRow
                    key={`global-${d.type}-${d.id}`}
                    d={d}
                    selected={d.id === selectedId}
                    onSelect={onSelect}
                    isGlobal
                  />
                ))}
              </ul>
            </>
          )}
        </ScrollArea>
      </div>
    );
  },
);

function ChatRow({
  d,
  selected,
  onSelect,
  isGlobal = false,
}: {
  d: Dialog;
  selected: boolean;
  onSelect: (d: Dialog) => void;
  isGlobal?: boolean;
}) {
  return (
    <li className="px-2">
      <button
        type="button"
        onClick={() => onSelect(d)}
        className={cn(
          // min-h-[64px] ensures 44px+ touch target with padding room
          "flex min-h-[64px] w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-all duration-100",
          selected
            ? "bg-primary/10 ring-1 ring-primary/20"
            : "hover:bg-muted/60 active:bg-muted/80",
        )}
      >
        <div className="relative shrink-0">
          <ChatAvatar
            peerId={d.id}
            title={d.title}
            hasPhoto={d.hasPhoto}
            size={50}
          />
          {d.presence?.kind === "online" && (
            <span
              className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-card bg-emerald-500"
              data-testid={`online-dot-${d.id}`}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium leading-snug">{d.title}</span>
            {d.isVerified && (
              <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
            )}
            {d.isBot && (
              <Bot className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            {d.isPinned && (
              <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
            <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
              {d.lastMessage ? formatRelative(d.lastMessage.date) : ""}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <p className="truncate text-xs text-muted-foreground">
              {d.username ? (
                <span className="text-primary/70">@{d.username}</span>
              ) : d.lastMessage?.out ? (
                <>
                  <span className="text-foreground/60">You: </span>
                  {d.lastMessage.text}
                </>
              ) : d.lastMessage?.text ? (
                d.lastMessage.text
              ) : (
                <span className="italic text-muted-foreground/60">
                  {d.type === "channel" ? "Channel" : d.type === "chat" ? "Group" : d.isBot ? "Bot" : "User"}
                  {isGlobal && " · not in your chats"}
                </span>
              )}
            </p>
            {d.unreadCount > 0 && (
              <Badge className="ml-auto h-5 min-w-[20px] shrink-0 rounded-full px-1.5 text-[10px]">
                {d.unreadCount > 99 ? "99+" : d.unreadCount}
              </Badge>
            )}
          </div>
        </div>
      </button>
    </li>
  );
}
