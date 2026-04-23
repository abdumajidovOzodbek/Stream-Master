import { useState } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch as ToggleSwitch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, ExternalLink, Download, Film, Search } from "lucide-react";

const queryClient = new QueryClient();

interface VideoEntry {
  messageId: number;
  fileSize: number | null;
  duration: number | null;
  mimeType: string | null;
  fileName: string;
  date: number;
  caption: string | null;
  url: string;
  telegramUrl: string;
  downloaded: boolean;
}

interface VideosResponse {
  channel: string;
  count: number;
  videos: VideoEntry[];
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[u]}`;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(unix: number): string {
  return new Date(unix * 1000).toLocaleString();
}

function VideoCard({ video, download }: { video: VideoEntry; download: boolean }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base font-medium">
            Message #{video.messageId}
          </CardTitle>
          <div className="flex gap-1">
            {video.downloaded && <Badge variant="secondary">Cached</Badge>}
            {video.mimeType && (
              <Badge variant="outline" className="font-mono text-xs">
                {video.mimeType.replace("video/", "")}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {download && video.downloaded ? (
          <video
            controls
            preload="metadata"
            src={video.url}
            className="w-full rounded-md bg-black"
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center rounded-md bg-muted">
            <Film className="h-12 w-12 text-muted-foreground" />
          </div>
        )}

        {video.caption && (
          <p className="line-clamp-3 text-sm text-muted-foreground">
            {video.caption}
          </p>
        )}

        <div className="grid grid-cols-3 gap-3 text-xs">
          <div>
            <div className="text-muted-foreground">Duration</div>
            <div className="font-mono">{formatDuration(video.duration)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Size</div>
            <div className="font-mono">{formatBytes(video.fileSize)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Date</div>
            <div className="font-mono text-[10px]">{formatDate(video.date)}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={video.telegramUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1 h-3 w-3" />
              Open in Telegram
            </a>
          </Button>
          {download && video.downloaded && (
            <Button asChild size="sm" variant="outline">
              <a href={video.url} download>
                <Download className="mr-1 h-3 w-3" />
                Download file
              </a>
            </Button>
          )}
        </div>

        <div className="break-all rounded-md bg-muted/50 p-2 font-mono text-[10px] text-muted-foreground">
          {video.telegramUrl}
        </div>
      </CardContent>
    </Card>
  );
}

function Home() {
  const [channelInput, setChannelInput] = useState("");
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [limit, setLimit] = useState(10);
  const [download, setDownload] = useState(false);

  const { data, isFetching, error, refetch } = useQuery<VideosResponse>({
    queryKey: ["channel-videos", activeChannel, limit, download],
    enabled: !!activeChannel,
    queryFn: async () => {
      const params = new URLSearchParams({
        channel: activeChannel!,
        limit: String(limit),
        download: String(download),
      });
      const res = await fetch(`/api/channel-videos?${params.toString()}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
        throw new Error(body.detail || body.error || `HTTP ${res.status}`);
      }
      return (await res.json()) as VideosResponse;
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const c = channelInput.trim().replace(/^@/, "");
    if (c) setActiveChannel(c);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto max-w-6xl px-6 py-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            Telegram Channel Videos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse videos from any Telegram channel your account has joined.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <Card className="mb-6">
          <CardContent className="pt-6">
            <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[240px]">
                <Label htmlFor="channel" className="mb-1.5 block text-xs">
                  Channel username
                </Label>
                <Input
                  id="channel"
                  placeholder="e.g. durov"
                  value={channelInput}
                  onChange={(e) => setChannelInput(e.target.value)}
                />
              </div>
              <div className="w-24">
                <Label htmlFor="limit" className="mb-1.5 block text-xs">
                  Limit
                </Label>
                <Input
                  id="limit"
                  type="number"
                  min={1}
                  max={100}
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value) || 10)}
                />
              </div>
              <div className="flex items-center gap-2 pb-2">
                <ToggleSwitch
                  id="download"
                  checked={download}
                  onCheckedChange={setDownload}
                />
                <Label htmlFor="download" className="text-xs">
                  Download &amp; play
                </Label>
              </div>
              <Button type="submit" disabled={isFetching}>
                {isFetching ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Search className="mr-1 h-4 w-4" />
                )}
                Fetch videos
              </Button>
              {activeChannel && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => refetch()}
                  disabled={isFetching}
                >
                  Refresh
                </Button>
              )}
            </form>
          </CardContent>
        </Card>

        {error && (
          <Card className="mb-6 border-destructive/50">
            <CardContent className="pt-6">
              <div className="text-sm text-destructive">
                <strong>Error:</strong> {(error as Error).message}
              </div>
            </CardContent>
          </Card>
        )}

        {isFetching && !data && (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Fetching videos from Telegram...
          </div>
        )}

        {data && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                <span className="font-mono font-medium text-foreground">
                  {data.count}
                </span>{" "}
                video{data.count === 1 ? "" : "s"} from{" "}
                <span className="font-mono font-medium text-foreground">
                  @{data.channel}
                </span>
              </div>
            </div>
            {data.videos.length === 0 ? (
              <div className="rounded-lg border border-dashed py-20 text-center text-sm text-muted-foreground">
                No videos found in the most recent {limit} messages.
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {data.videos.map((v) => (
                  <VideoCard key={v.messageId} video={v} download={download} />
                ))}
              </div>
            )}
          </>
        )}

        {!activeChannel && !isFetching && (
          <div className="rounded-lg border border-dashed py-20 text-center text-sm text-muted-foreground">
            Enter a channel username above to start.
          </div>
        )}
      </main>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
