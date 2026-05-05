import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, type Dialog } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ExternalLink, MessageSquare, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChannelLookupPage } from "./ChannelLookupPage";

interface Channel {
  username: string;
  title: string;
  description: string;
  badge?: string;
}

interface Category {
  label: string;
  emoji: string;
  channels: Channel[];
}

const CATEGORIES: Category[] = [
  {
    label: "Official",
    emoji: "📣",
    channels: [
      { username: "telegram", title: "Telegram", description: "Official Telegram channel" },
      { username: "durov", title: "Pavel Durov", description: "Founder of Telegram", badge: "Founder" },
      { username: "TelegramTips", title: "Telegram Tips", description: "Tricks & tips from the Telegram team" },
    ],
  },
  {
    label: "Technology",
    emoji: "💻",
    channels: [
      { username: "tgbeta", title: "Telegram Beta", description: "Beta version news and updates" },
      { username: "openai", title: "OpenAI News", description: "Latest from OpenAI" },
      { username: "tlgrm_ru", title: "Tlgrm.ru", description: "Telegram digest and news" },
    ],
  },
  {
    label: "News",
    emoji: "📰",
    channels: [
      { username: "BBCNews", title: "BBC News", description: "Breaking news from the BBC" },
      { username: "Reuters", title: "Reuters", description: "Global news wire" },
      { username: "TheEconomist", title: "The Economist", description: "Analysis and opinion" },
    ],
  },
  {
    label: "Popular Bots",
    emoji: "🤖",
    channels: [
      { username: "GIF", title: "GIF bot", description: "Inline GIF search", badge: "Bot" },
      { username: "sticker", title: "Sticker bot", description: "Create your own sticker packs", badge: "Bot" },
      { username: "wiki", title: "Wiki bot", description: "Inline Wikipedia search", badge: "Bot" },
    ],
  },
];

type Tab = "discover" | "lookup";

interface Props {
  onSelect: (d: Dialog) => void;
}

export function DiscoverPage({ onSelect }: Props) {
  const [tab, setTab] = useState<Tab>("discover");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();

  async function open(username: string) {
    setLoading(username);
    setError(null);
    try {
      const results = await api.searchContacts(username, 5);
      const match = results.find(
        (r) => r.username?.toLowerCase() === username.toLowerCase()
      ) ?? results[0];
      if (match) {
        onSelect(match);
        await qc.invalidateQueries({ queryKey: ["dialogs"] });
      } else {
        setError(`Could not find @${username}`);
      }
    } catch {
      setError(`Failed to open @${username}`);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="flex shrink-0 border-b bg-card/80 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => setTab("discover")}
          className={cn(
            "flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-medium transition-colors",
            tab === "discover"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Discover
        </button>
        <button
          type="button"
          onClick={() => setTab("lookup")}
          className={cn(
            "flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-medium transition-colors",
            tab === "lookup"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <Users className="h-3.5 w-3.5" />
          Member Lookup
        </button>
      </div>

      {tab === "lookup" ? (
        <div key="lookup" className="flex-1 min-h-0 overflow-y-auto animate-in fade-in duration-150">
          <ChannelLookupPage />
        </div>
      ) : (
        <div key="discover" className="flex-1 overflow-y-auto chat-bg animate-in fade-in duration-150">
          {/* Hero */}
          <div className="flex flex-col items-center gap-4 px-6 pb-8 pt-12 text-center">
            <div className="flex h-[72px] w-[72px] items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
              <MessageSquare className="h-9 w-9" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Discover Telegram</h2>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground leading-relaxed">
                Select a chat from the sidebar, or explore popular channels and bots below.
              </p>
            </div>
            {error && (
              <p className="rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>
            )}
          </div>

          {/* Categories */}
          <div className="space-y-8 px-4 pb-12 sm:px-6">
            {CATEGORIES.map((cat) => (
              <div key={cat.label}>
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-lg">{cat.emoji}</span>
                  <span className="text-sm font-semibold tracking-wide">{cat.label}</span>
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                  {cat.channels.map((ch) => (
                    <button
                      key={ch.username}
                      type="button"
                      onClick={() => open(ch.username)}
                      disabled={!!loading}
                      className={cn(
                        "group flex flex-col gap-1 rounded-xl border bg-card/90 p-3.5 text-left transition-all duration-150 shadow-sm",
                        "hover:border-primary/40 hover:bg-card hover:shadow-md hover:-translate-y-0.5",
                        "disabled:pointer-events-none disabled:opacity-50",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{ch.title}</span>
                        {ch.badge && (
                          <Badge variant="secondary" className="shrink-0 text-[10px]">
                            {ch.badge}
                          </Badge>
                        )}
                        {loading === ch.username ? (
                          <Loader2 className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                        ) : (
                          <ExternalLink className="ml-auto h-3 w-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">@{ch.username}</span>
                      <span className="text-xs text-muted-foreground/70">{ch.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
