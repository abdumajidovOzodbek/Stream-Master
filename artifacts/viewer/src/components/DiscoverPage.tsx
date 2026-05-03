import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, type Dialog } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ExternalLink, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

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

interface Props {
  onSelect: (d: Dialog) => void;
}

export function DiscoverPage({ onSelect }: Props) {
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
    <div className="flex h-full flex-col overflow-y-auto bg-muted/20">
      {/* Hero */}
      <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <MessageSquare className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold">Discover Telegram</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Select a chat from the sidebar, or explore popular channels and bots below.
          Click any to open it instantly.
        </p>
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
      </div>

      {/* Categories */}
      <div className="space-y-6 px-5 pb-10">
        {CATEGORIES.map((cat) => (
          <div key={cat.label}>
            <div className="mb-3 flex items-center gap-2">
              <span>{cat.emoji}</span>
              <span className="text-sm font-semibold">{cat.label}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {cat.channels.map((ch) => (
                <button
                  key={ch.username}
                  type="button"
                  onClick={() => open(ch.username)}
                  disabled={!!loading}
                  className={cn(
                    "group flex flex-col gap-1 rounded-xl border bg-card p-3 text-left transition-all",
                    "hover:border-primary/30 hover:bg-primary/5 hover:shadow-sm",
                    "disabled:opacity-50",
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
  );
}
