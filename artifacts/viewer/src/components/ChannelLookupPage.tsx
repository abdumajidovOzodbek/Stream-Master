import { useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type UserInfo, type SubscriberEntry } from "@/lib/api";
import { ChatAvatar } from "./Avatar";
import { UserProfileCard } from "./UserProfileCard";
import { SubscriberRow } from "./SubscribersPanel";
import {
  Search,
  Loader2,
  Users,
  Lock,
  AtSign,
  Info,
  Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";

const PAGE_SIZE = 100;

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function normalizeHandle(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("https://t.me/")) s = s.slice("https://t.me/".length);
  else if (s.startsWith("t.me/")) s = s.slice("t.me/".length);
  if (s.startsWith("@")) s = s.slice(1);
  return s;
}

function ChannelInfoCard({ info }: { info: UserInfo }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-card/80 p-4 shadow-sm">
      <ChatAvatar
        peerId={info.id}
        title={info.name}
        hasPhoto={info.hasPhoto}
        size={52}
        className="shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-base font-semibold leading-tight">{info.name}</span>
          {info.isBot && (
            <span className="flex items-center gap-0.5 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
              <Bot className="h-2.5 w-2.5" />
              Bot
            </span>
          )}
        </div>
        {info.username && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <AtSign className="h-3 w-3" />
            {info.username}
          </div>
        )}
        {info.participantsCount !== null && (
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            {formatCount(info.participantsCount)}{" "}
            {info.type === "channel" ? "subscribers" : "members"}
          </div>
        )}
        {info.bio && (
          <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{info.bio}</p>
        )}
      </div>
    </div>
  );
}

interface MemberListProps {
  chatId: string;
  onOpenProfile: (id: string) => void;
}

function MemberList({ chatId, onOpenProfile }: MemberListProps) {
  const [rawSearch, setRawSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [allLoaded, setAllLoaded] = useState<SubscriberEntry[]>([]);
  const [hasMore, setHasMore] = useState(true);

  const search = useDebounce(rawSearch, 300);

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["lookup-subscribers", chatId, search, offset],
    queryFn: async () => {
      const result = await api.subscribers(chatId, PAGE_SIZE, offset, search);
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

  const broadcastOnly = data?.broadcastOnly ?? false;
  const total = data?.total ?? null;

  if (isLoading && allLoaded.length === 0) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (broadcastOnly) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <Lock className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm font-medium">Subscriber list is private</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Telegram does not expose subscriber identities for broadcast channels — this is by design to protect user privacy.
          {total !== null && total > 0 && (
            <> The channel has <strong>{total.toLocaleString()}</strong> subscribers.</>
          )}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-destructive/10 px-4 py-3 text-center text-xs text-destructive">
        {(error as Error).message}
      </div>
    );
  }

  return (
    <div>
      {/* Member count + search */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">
          Members
          {total !== null && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              ({total.toLocaleString()})
            </span>
          )}
        </span>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={rawSearch}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search members…"
          className="h-8 pl-8 text-xs"
        />
      </div>

      {allLoaded.length === 0 && !isLoading && (
        <p className="py-6 text-center text-sm text-muted-foreground">No members found</p>
      )}

      <div className="space-y-0.5">
        {allLoaded.map((sub) => (
          <SubscriberRow key={sub.id} sub={sub} onAvatarClick={onOpenProfile} />
        ))}
      </div>

      {hasMore && allLoaded.length > 0 && (
        <button
          type="button"
          onClick={() => setOffset((o) => o + PAGE_SIZE)}
          disabled={isFetching}
          className="mt-3 w-full rounded-md py-2 text-xs text-primary hover:underline disabled:opacity-50"
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
  );
}

export function ChannelLookupPage() {
  const [input, setInput] = useState("");
  const [submittedHandle, setSubmittedHandle] = useState<string | null>(null);
  const [profilePeerId, setProfilePeerId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = submittedHandle;

  const {
    data: channelInfo,
    isLoading: infoLoading,
    error: infoError,
  } = useQuery({
    queryKey: ["lookup-channel-info", handle],
    queryFn: () => api.getUserInfo(handle!),
    enabled: !!handle,
    staleTime: 60_000,
    retry: 1,
  });

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const h = normalizeHandle(input);
    if (!h) return;
    setSubmittedHandle(h);
  }

  const isChannel =
    channelInfo?.type === "channel" || channelInfo?.type === "chat";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Sticky top bar */}
      <div className="border-b bg-card/80 backdrop-blur-sm px-4 py-4 shrink-0">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Users className="h-4 w-4 text-primary" />
          Look up channel or group members
        </h2>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <AtSign className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="username or t.me/link"
              className="pl-8 text-sm"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <Button
            type="submit"
            disabled={!input.trim() || infoLoading}
            size="default"
          >
            {infoLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            <span className="ml-1.5 hidden sm:inline">Lookup</span>
          </Button>
        </form>
        {infoError && (
          <p className="mt-2 text-xs text-destructive">
            {(infoError as Error).message.includes("USERNAME_INVALID") ||
            (infoError as Error).message.includes("USERNAME_NOT_OCCUPIED") ||
            (infoError as Error).message.includes("No user has")
              ? `Could not find @${handle}. Make sure the username is correct.`
              : (infoError as Error).message}
          </p>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {!handle && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Users className="h-8 w-8 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Look up any channel or group</p>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                Enter a username or paste a <code className="rounded bg-muted px-1 py-0.5">t.me/</code> link to view the members of any public Telegram group or supergroup.
              </p>
            </div>
            <div className="mt-2 rounded-lg border bg-muted/40 px-4 py-3 text-left text-xs text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Examples:</p>
              {["durov", "telegram", "t.me/somegroup"].map((ex) => (
                <button
                  key={ex}
                  type="button"
                  className="block text-primary hover:underline"
                  onClick={() => {
                    setInput(ex);
                    setSubmittedHandle(normalizeHandle(ex));
                  }}
                >
                  @{normalizeHandle(ex)}
                </button>
              ))}
            </div>
          </div>
        )}

        {infoLoading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {channelInfo && !infoLoading && (
          <>
            <ChannelInfoCard info={channelInfo} />

            {isChannel ? (
              <MemberList
                chatId={channelInfo.id}
                onOpenProfile={setProfilePeerId}
              />
            ) : (
              <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
                <Info className="h-4 w-4 shrink-0" />
                This is a user account, not a channel or group.
              </div>
            )}
          </>
        )}
      </div>

      {/* Profile card modal */}
      <UserProfileCard
        peerId={profilePeerId}
        open={profilePeerId !== null}
        onClose={() => setProfilePeerId(null)}
      />
    </div>
  );
}
