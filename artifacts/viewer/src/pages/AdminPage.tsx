import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, adminApi, type AdminSession } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Lock,
  Users,
  LogIn,
  ArrowLeft,
  RefreshCw,
  ShieldAlert,
  UserCircle,
  Loader2,
  Eye,
  CornerUpLeft,
} from "lucide-react";

const ADMIN_SECRET_KEY = "tg_admin_secret";

function formatLastSeen(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function getImpersonateCookie(): string | null {
  for (const pair of document.cookie.split(";")) {
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    if (pair.slice(0, idx).trim() === "tg_impersonate") {
      return pair.slice(idx + 1).trim() || null;
    }
  }
  return null;
}

function SessionCard({
  session,
  isImpersonating,
  onViewAs,
  loading,
}: {
  session: AdminSession;
  isImpersonating: boolean;
  onViewAs: () => void;
  loading: boolean;
}) {
  const displayName =
    session.firstName ??
    (session.username ? `@${session.username}` : null) ??
    session.phone ??
    "Unknown user";

  const sub = session.username
    ? `@${session.username}`
    : session.phone
    ? session.phone
    : session.userId
    ? `ID: ${session.userId}`
    : null;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-card px-4 py-3 transition-colors",
        isImpersonating && "border-amber-400/40 bg-amber-50 dark:bg-amber-900/20",
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <UserCircle className="h-6 w-6" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-foreground">{displayName}</span>
          {isImpersonating && (
            <span className="shrink-0 rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
              viewing
            </span>
          )}
        </div>
        {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
        <p className="text-[11px] text-muted-foreground/60">Last active: {formatLastSeen(session.lastSeen)}</p>
      </div>

      <Button
        size="sm"
        variant={isImpersonating ? "default" : "outline"}
        onClick={onViewAs}
        disabled={loading}
        className="shrink-0 gap-1.5 text-xs"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Eye className="h-3.5 w-3.5" />
        )}
        {isImpersonating ? "Viewing" : "View as"}
      </Button>
    </div>
  );
}

const ADMIN_USERNAME = "abdumajidov_ozodbek";

export default function AdminPage() {
  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ["me"],
    queryFn: api.me,
    staleTime: Infinity,
    retry: 0,
  });

  useEffect(() => {
    if (meLoading) return;
    if (!me || me.username !== ADMIN_USERNAME) {
      window.location.replace("/");
    }
  }, [me, meLoading]);

  const [secret, setSecret] = useState(() => sessionStorage.getItem(ADMIN_SECRET_KEY) ?? "");
  const [verified, setVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [viewingAs, setViewingAs] = useState<string | null>(() => getImpersonateCookie());
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);

  async function verify() {
    if (!secret.trim()) return;
    setVerifying(true);
    setVerifyError("");
    try {
      const res = await adminApi.verify(secret.trim());
      if (res.ok) {
        sessionStorage.setItem(ADMIN_SECRET_KEY, secret.trim());
        setVerified(true);
      } else {
        setVerifyError(res.error ?? "Incorrect secret");
      }
    } catch (e) {
      setVerifyError(e instanceof Error ? e.message : "Failed to verify");
    } finally {
      setVerifying(false);
    }
  }

  async function loadSessions() {
    setLoadingSessions(true);
    setLoadError("");
    try {
      const res = await adminApi.sessions(secret.trim());
      setSessions(res.sessions);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load sessions");
    } finally {
      setLoadingSessions(false);
    }
  }

  useEffect(() => {
    if (verified) void loadSessions();
  }, [verified]);

  async function handleViewAs(targetSessionId: string) {
    setSwitchingTo(targetSessionId);
    try {
      await adminApi.impersonate(secret.trim(), targetSessionId);
      // Cookie is now set server-side — navigate to home to see target's account
      window.location.href = "/";
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to switch session");
      setSwitchingTo(null);
    }
  }

  async function handleReturn() {
    setStopping(true);
    try {
      await adminApi.stopImpersonate(secret.trim());
    } catch {
      // Best-effort — clear cookie client-side too
      document.cookie = "tg_impersonate=; Path=/; Max-Age=0; SameSite=Lax";
    } finally {
      setStopping(false);
      setViewingAs(null);
      window.location.href = "/admin";
    }
  }

  if (meLoading || !me || me.username !== ADMIN_USERNAME) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur-sm">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Lock className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold text-foreground">Admin Panel</h1>
          <p className="text-xs text-muted-foreground">Telegram Multi-User Manager</p>
        </div>
        <Button variant="ghost" size="sm" asChild className="gap-1.5 text-xs">
          <a href="/">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to App
          </a>
        </Button>
      </header>

      <main className="flex-1 px-4 py-6">
        <div className="mx-auto max-w-lg space-y-4">

          {/* Impersonation banner */}
          {viewingAs && (
            <div className="flex items-center gap-3 rounded-xl border border-amber-400/40 bg-amber-50 px-4 py-3 dark:bg-amber-900/20">
              <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="min-w-0 flex-1 text-sm text-amber-800 dark:text-amber-300">
                Currently viewing another user's account
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleReturn()}
                disabled={stopping}
                className="shrink-0 gap-1.5 border-amber-400/40 text-xs text-amber-700 hover:bg-amber-100 dark:text-amber-300"
              >
                {stopping ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CornerUpLeft className="h-3.5 w-3.5" />
                )}
                Return to my account
              </Button>
            </div>
          )}

          {/* Auth card */}
          {!verified ? (
            <div className="rounded-2xl border bg-card p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <Lock className="h-5 w-5 text-muted-foreground" />
                <h2 className="font-semibold text-foreground">Admin Login</h2>
              </div>
              <p className="mb-4 text-sm text-muted-foreground">
                Enter your admin secret to manage user sessions.
              </p>
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="Admin secret…"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void verify()}
                  className="flex-1"
                />
                <Button onClick={() => void verify()} disabled={verifying || !secret.trim()}>
                  {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                </Button>
              </div>
              {verifyError && (
                <p className="mt-2 text-sm text-destructive">{verifyError}</p>
              )}
              <p className="mt-3 text-[11px] text-muted-foreground/60">
                Set the <code className="rounded bg-muted px-1">ADMIN_SECRET</code> environment variable in Replit Secrets to enable this page.
              </p>
            </div>
          ) : (
            <>
              {/* Session list */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-foreground">
                    Logged-in Users
                    {sessions.length > 0 && (
                      <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                        {sessions.length}
                      </span>
                    )}
                  </h2>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void loadSessions()}
                  disabled={loadingSessions}
                  className="h-7 gap-1 text-xs"
                >
                  <RefreshCw className={cn("h-3 w-3", loadingSessions && "animate-spin")} />
                  Refresh
                </Button>
              </div>

              {loadingSessions ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : loadError ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {loadError}
                </div>
              ) : sessions.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card py-12 text-center">
                  <Users className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No logged-in users yet</p>
                  <p className="text-xs text-muted-foreground/60">Users will appear here once they sign in</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sessions.map((s) => (
                    <SessionCard
                      key={s.sessionId}
                      session={s}
                      isImpersonating={viewingAs === s.sessionId}
                      loading={switchingTo === s.sessionId}
                      onViewAs={() => void handleViewAs(s.sessionId)}
                    />
                  ))}
                </div>
              )}

              <p className="text-center text-[11px] text-muted-foreground/50">
                Clicking "View as" lets you browse Telegram as that user. Their session data is not changed.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
