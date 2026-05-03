import { useEffect, useRef, useState } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { ChatList } from "@/components/ChatList";
import { MessageView } from "@/components/MessageView";
import { ChatAvatar } from "@/components/Avatar";
import { Login } from "@/components/Login";
import { Button } from "@/components/ui/button";
import { api, type Dialog } from "@/lib/api";
import { useTheme } from "@/hooks/use-theme";
import { useDesktopNotifications } from "@/hooks/use-notifications";
import { KeyboardShortcutsModal } from "@/components/KeyboardShortcutsModal";
import { DiscoverPage } from "@/components/DiscoverPage";
import { MessageSquare, Loader2, LogOut, Moon, Sun, EyeOff, Eye, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const queryClient = new QueryClient();

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      title={theme === "dark" ? "Switch to light mode (Ctrl+D)" : "Switch to dark mode (Ctrl+D)"}
      data-testid="button-theme-toggle"
    >
      {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  );
}

function LogoutButton() {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => api.logout(),
    onSuccess: async () => {
      qc.clear();
      await qc.invalidateQueries({ queryKey: ["auth-status"] });
    },
  });
  return (
    <Button
      variant="ghost"
      size="icon"
      title="Log out"
      onClick={() => { if (confirm("Log out of Telegram?")) m.mutate(); }}
      disabled={m.isPending}
    >
      {m.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
    </Button>
  );
}

function ChatApp() {
  const [selected, setSelected] = useState<Dialog | null>(null);
  const [stealthMode, setStealthMode] = useState(() => localStorage.getItem("stealth-mode") === "1");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const deepLinkApplied = useRef(false);
  const { toggle: toggleTheme } = useTheme();

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: api.me, staleTime: Infinity });

  const { data: dialogsData } = useQuery({
    queryKey: ["dialogs"],
    queryFn: () => api.dialogs(150),
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  const dialogs = dialogsData?.dialogs ?? [];
  const totalUnread = dialogs.reduce((s, d) => s + d.unreadCount, 0);

  useDesktopNotifications(dialogs, setSelected);

  // Persist stealth mode
  useEffect(() => {
    localStorage.setItem("stealth-mode", stealthMode ? "1" : "0");
  }, [stealthMode]);

  // Deep link: read ?c=chatId on first dialog load
  useEffect(() => {
    if (deepLinkApplied.current || dialogs.length === 0) return;
    deepLinkApplied.current = true;
    const chatId = new URLSearchParams(window.location.search).get("c");
    if (!chatId) return;
    const d = dialogs.find((x) => x.id === chatId);
    if (d) setSelected(d);
  }, [dialogs]);

  // Deep link: update URL when selected changes
  useEffect(() => {
    const url = new URL(window.location.href);
    if (selected) url.searchParams.set("c", selected.id);
    else url.searchParams.delete("c");
    window.history.replaceState({}, "", url.toString());
  }, [selected?.id]);

  // Global keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const inInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "l") {
        e.preventDefault();
        setStealthMode((v) => !v);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "d") {
        e.preventDefault();
        toggleTheme();
        return;
      }
      if (e.key === "?" && !inInput) {
        e.preventDefault();
        setShowShortcuts(true);
        return;
      }
      if (e.key === "Escape" && !inInput) {
        setSelected(null);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [toggleTheme]);

  const meName =
    [me?.firstName, me?.lastName].filter(Boolean).join(" ") || me?.username || "Me";

  const showSidebar = !selected;

  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden bg-background text-foreground">

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside
        className={cn(
          "flex w-full flex-col border-r bg-card",
          "md:flex md:w-[340px] md:shrink-0",
          selected ? "hidden md:flex" : "flex",
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-1.5 border-b px-2 py-2">
          {me ? (
            <>
              <ChatAvatar peerId={me.id} title={meName} hasPhoto={true} size={38} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{meName}</span>
                  {totalUnread > 0 && (
                    <span className="ml-auto shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium leading-none text-primary-foreground">
                      {totalUnread > 999 ? "999+" : totalUnread}
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {me.username ? `@${me.username}` : me.phone ? `+${me.phone}` : ""}
                </div>
              </div>
              {/* Stealth mode toggle */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setStealthMode((v) => !v)}
                title={stealthMode ? "Stealth ON: not marking messages as read (Ctrl+L)" : "Stealth OFF: marking messages as read (Ctrl+L)"}
                className={cn("h-9 w-9 shrink-0", stealthMode && "text-amber-500")}
              >
                {stealthMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <ThemeToggle />
              {/* Keyboard shortcuts */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowShortcuts(true)}
                title="Keyboard shortcuts (?)"
                className="h-9 w-9 shrink-0"
              >
                <HelpCircle className="h-4 w-4" />
              </Button>
              <LogoutButton />
            </>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          )}
        </div>

        {/* Chat list */}
        <div className="min-h-0 flex-1">
          <ChatList
            ref={searchRef}
            selectedId={selected?.id ?? null}
            onSelect={(d) => setSelected(d)}
          />
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────── */}
      <main
        className={cn(
          "flex min-w-0 flex-1 flex-col",
          selected ? "flex" : "hidden md:flex",
        )}
      >
        {selected ? (
          <MessageView
            key={`${selected.type}-${selected.id}`}
            dialog={selected}
            onBack={() => setSelected(null)}
            stealthMode={stealthMode}
          />
        ) : (
          <DiscoverPage onSelect={setSelected} />
        )}
      </main>

      {/* Modals */}
      <KeyboardShortcutsModal open={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </div>
  );
}

function Home() {
  const { data, isLoading } = useQuery({
    queryKey: ["auth-status"],
    queryFn: api.authStatus,
    staleTime: 60_000,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex h-[100dvh] w-screen items-center justify-center bg-muted/30">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data?.authenticated) return <Login />;
  return <ChatApp />;
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
