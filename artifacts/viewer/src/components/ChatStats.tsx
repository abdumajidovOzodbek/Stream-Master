import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { api, type Dialog } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  X,
  RefreshCw,
  BarChart2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const PARTICIPANT_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
  "#f97316",
  "#6366f1",
];

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => {
  if (i === 0) return "12a";
  if (i === 12) return "12p";
  if (i < 12) return `${i}a`;
  return `${i - 12}p`;
});

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border bg-card/60 p-3 text-center">
      <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
      <p className="text-base font-semibold mt-0.5 leading-tight truncate">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 mt-4 first:mt-2">
      {children}
    </h3>
  );
}

const tooltipStyle = {
  fontSize: 12,
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  background: "hsl(var(--card))",
  color: "hsl(var(--foreground))",
  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
};

export function ChatStats({
  dialog,
  onClose,
}: {
  dialog: Dialog;
  onClose: () => void;
}) {
  const [limit, setLimit] = useState(500);

  const { data: stats, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["chat-stats", dialog.id, limit],
    queryFn: () => api.chatStats(dialog.id, limit),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  function fmtDate(ts: number) {
    return new Date(ts * 1000).toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  const hourlyData = stats
    ? stats.hourly.map((count, i) => ({ hour: HOUR_LABELS[i], count }))
    : [];

  const weekdayData = stats
    ? stats.weekday.map((count, i) => ({ day: DAY_LABELS[i], count }))
    : [];

  const maxHourly = Math.max(...hourlyData.map((h) => h.count), 1);
  const maxWeekday = Math.max(...weekdayData.map((d) => d.count), 1);

  const mediaEntries = stats
    ? ([
        { label: "Text", count: stats.mediaTypes.text, color: "bg-blue-500", hex: "#3b82f6" },
        { label: "Photos", count: stats.mediaTypes.photos, color: "bg-emerald-500", hex: "#10b981" },
        { label: "Videos", count: stats.mediaTypes.videos, color: "bg-amber-500", hex: "#f59e0b" },
        { label: "Voice", count: stats.mediaTypes.voice, color: "bg-purple-500", hex: "#8b5cf6" },
        { label: "Stickers", count: stats.mediaTypes.stickers, color: "bg-pink-500", hex: "#ec4899" },
        { label: "Files", count: stats.mediaTypes.files, color: "bg-cyan-500", hex: "#06b6d4" },
        { label: "Other", count: stats.mediaTypes.other, color: "bg-slate-400", hex: "#94a3b8" },
      ] as const).filter((e) => e.count > 0)
    : [];

  const totalMedia = mediaEntries.reduce((s, e) => s + e.count, 0);

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-l bg-background/95 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2.5 shrink-0">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Chat Analytics</span>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => void refetch()}
            disabled={isFetching}
            title="Refresh"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
        {isLoading && (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground text-center leading-relaxed">
              Analyzing {limit.toLocaleString()} messages…
              <br />
              <span className="text-xs opacity-70">This may take a moment</span>
            </p>
          </div>
        )}

        {error && !isLoading && (
          <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {(error as Error).message}
          </div>
        )}

        {stats && !isLoading && (
          <>
            {/* Sample size + expand */}
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">
                {stats.analyzedCount.toLocaleString()} messages analyzed
              </span>
              {limit < 1000 && (
                <button
                  type="button"
                  className="text-[11px] text-primary hover:underline underline-offset-2"
                  onClick={() => setLimit(1000)}
                >
                  Analyze more
                </button>
              )}
            </div>

            {/* Summary cards */}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <StatCard label="Total Messages" value={stats.totalMessages.toLocaleString()} />
              <StatCard label="Avg Length" value={`${stats.averageMessageLength} chars`} />
              {stats.dateRange && (
                <StatCard
                  label="First Message"
                  value={fmtDate(stats.dateRange.first)}
                />
              )}
              {stats.mostActiveDay && (
                <StatCard
                  label="Most Active Day"
                  value={new Date(stats.mostActiveDay + "T12:00:00").toLocaleDateString([], {
                    month: "short",
                    day: "numeric",
                  })}
                  sub={`${stats.mostActiveDayCount} messages`}
                />
              )}
            </div>

            {/* Top participants */}
            {stats.participants.length > 0 && (
              <>
                <SectionTitle>
                  {dialog.type === "user" ? "Message Split" : "Top Participants"}
                </SectionTitle>
                <div className="space-y-2.5">
                  {stats.participants.slice(0, 7).map((p, i) => (
                    <div key={p.id}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span
                          className="text-xs font-medium truncate max-w-[140px]"
                          style={{ color: PARTICIPANT_COLORS[i % PARTICIPANT_COLORS.length] }}
                          title={p.name}
                        >
                          {p.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0 ml-1">
                          {p.count.toLocaleString()} ({p.percentage}%)
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${p.percentage}%`,
                            backgroundColor: PARTICIPANT_COLORS[i % PARTICIPANT_COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Hourly activity */}
            <SectionTitle>Activity by Hour</SectionTitle>
            <div className="h-28 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={hourlyData}
                  margin={{ top: 2, right: 2, left: -28, bottom: 0 }}
                >
                  <XAxis
                    dataKey="hour"
                    tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    interval={5}
                  />
                  <YAxis
                    tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: "hsl(var(--muted))" }}
                    formatter={(v: number) => [v, "messages"]}
                    labelFormatter={(l: string) => `${l} — ${l.replace("a", ":00 AM").replace("p", ":00 PM")}`}
                  />
                  <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                    {hourlyData.map((entry, idx) => (
                      <Cell
                        key={idx}
                        fill="hsl(var(--primary))"
                        fillOpacity={0.4 + 0.6 * (entry.count / maxHourly)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Weekday activity */}
            <SectionTitle>Activity by Day of Week</SectionTitle>
            <div className="h-28 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={weekdayData}
                  margin={{ top: 2, right: 2, left: -28, bottom: 0 }}
                >
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: "hsl(var(--muted))" }}
                    formatter={(v: number) => [v, "messages"]}
                  />
                  <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                    {weekdayData.map((entry, idx) => (
                      <Cell
                        key={idx}
                        fill="#10b981"
                        fillOpacity={0.4 + 0.6 * (entry.count / maxWeekday)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Message types */}
            {mediaEntries.length > 0 && (
              <>
                <SectionTitle>Message Types</SectionTitle>
                <div className="flex h-2.5 w-full overflow-hidden rounded-full mb-3">
                  {mediaEntries.map((e) => (
                    <div
                      key={e.label}
                      className={cn("h-full", e.color)}
                      style={{ width: `${(e.count / totalMedia) * 100}%` }}
                      title={`${e.label}: ${e.count}`}
                    />
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {mediaEntries.map((e) => (
                    <div key={e.label} className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: e.hex }}
                      />
                      <span className="text-xs text-muted-foreground truncate">{e.label}</span>
                      <span className="ml-auto text-xs font-medium shrink-0">
                        {e.count.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Top words */}
            {stats.topWords.length > 0 && (
              <>
                <SectionTitle>Top Words</SectionTitle>
                <div className="flex flex-wrap gap-1.5">
                  {stats.topWords.slice(0, 15).map((w) => {
                    const maxCount = stats.topWords[0]?.count ?? 1;
                    const scale = 0.72 + (w.count / maxCount) * 0.42;
                    return (
                      <span
                        key={w.word}
                        className="rounded-full border border-border bg-muted/60 px-2 py-0.5 text-foreground/80 cursor-default"
                        style={{ fontSize: `${scale}rem` }}
                        title={`${w.count} times`}
                      >
                        {w.word}
                      </span>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
