import { useEffect, useRef, useState } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import AdminPage from "@/pages/AdminPage";
import { ChatList } from "@/components/ChatList";
import { MessageView } from "@/components/MessageView";
import { ChatAvatar } from "@/components/Avatar";
import { Login } from "@/components/Login";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api, adminApi, type Dialog } from "@/lib/api";
import { useSSE } from "@/hooks/use-sse";
import { useTheme } from "@/hooks/use-theme";
import { useDesktopNotifications } from "@/hooks/use-notifications";
import { KeyboardShortcutsModal } from "@/components/KeyboardShortcutsModal";
import { DiscoverPage } from "@/components/DiscoverPage";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Loader2,
  LogOut,
  Moon,
  Sun,
  EyeOff,
  Eye,
  Keyboard,
  MoreVertical,
  ShieldAlert,
  CornerUpLeft,
  Lock,
} from "lucide-react";
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
      className="h-10 w-10 shrink-0"
      data-testid="button-theme-toggle"
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

function ImpersonationBanner({ onReturn }: { onReturn: () => void }) {
  const [stopping, setStopping] = useState(false);

  async function handleReturn() {
    setStopping(true);
    const secret = sessionStorage.getItem("tg_admin_secret") ?? "";
    try {
      if (secret) await adminApi.stopImpersonate(secret);
    } catch {
      // best-effort
    } finally {
      setStopping(false);
      onReturn();
    }
  }

  return (
    <div className="flex items-center gap-2 border-b border-amber-400/30 bg-amber-50 px-3 py-1.5 text-xs dark:bg-amber-900/20">
      <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
      <span className="flex-1 text-amber-800 dark:text-amber-300">Viewing as another user</span>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1 px-2 text-xs text-amber-700 hover:bg-amber-100 dark:text-amber-300"
        onClick={() => void handleReturn()}
        disabled={stopping}
      >
        {stopping ? <Loader2 className="h-3 w-3 animate-spin" /> : <CornerUpLeft className="h-3 w-3" />}
        Return
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1 px-2 text-xs text-amber-700 hover:bg-amber-100 dark:text-amber-300"
        asChild
      >
        <a href="/admin">
          <Lock className="h-3 w-3" />
          Admin
        </a>
      </Button>
    </div>
  );
}

function ChatApp({ impersonating }: { impersonating: boolean }) {
  const [selected, setSelected] = useState<Dialog | null>(null);
  const [stealthMode, setStealthMode] = useState(() => localStorage.getItem("stealth-mode") === "1");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const deepLinkApplied = useRef(false);
  const { toggle: toggleTheme } = useTheme();

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: api.me, staleTime: Infinity });

  // Mount SSE — real-time push updates. Dialogs polling kept at 2 min as fallback.
  useSSE();

  const { data: dialogsData } = useQuery({
    queryKey: ["dialogs"],
    queryFn: () => api.dialogs(150),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const dialogs = dialogsData?.dialogs ?? [];
  const totalUnread = dialogs.reduce((s, d) => s + d.unreadCount, 0);

  useDesktopNotifications(dialogs, setSelected);

  useEffect(() => {
    localStorage.setItem("stealth-mode", stealthMode ? "1" : "0");
  }, [stealthMode]);

  useEffect(() => {
    if (deepLinkApplied.current || dialogs.length === 0) return;
    deepLinkApplied.current = true;
    const chatId = new URLSearchParams(window.location.search).get("c");
    if (!chatId) return;
    const d = dialogs.find((x) => x.id === chatId);
    if (d) setSelected(d);
  }, [dialogs]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (selected) url.searchParams.set("c", selected.id);
    else url.searchParams.delete("c");
    window.history.replaceState({}, "", url.toString());
  }, [selected?.id]);

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

  function handleSelect(d: Dialog) {
    setSelected(d);
  }

  function handleBack() {
    setSelected(null);
  }

  return (
    <div className="h-dvh flex w-screen flex-col overflow-hidden bg-background text-foreground">
      {impersonating && <ImpersonationBanner onReturn={() => { window.location.href = "/admin"; }} />}

      {/* Pane container — relative+overflow-hidden is needed for mobile absolute positioning */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* ── Sidebar ─────────────────────────────────────────────── */}
        <aside
          className={cn(
            "flex flex-col border-r bg-sidebar",
            // Mobile: absolutely positioned so both panes can animate simultaneously
            "absolute inset-y-0 left-0 w-full",
            // Desktop: normal flex child with responsive width
            "md:relative md:inset-auto md:w-[280px] md:shrink-0 lg:w-[320px] xl:w-[360px]",
            // Slide transition — CSS transform so both panes animate together
            "transition-transform duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
            // md+ always visible, override any mobile translate
            "md:!translate-x-0",
            selected ? "-translate-x-full" : "translate-x-0",
          )}
        >
          {/* Header */}
          <div className="flex items-center gap-2 border-b px-3 py-2">
            {me ? (
              <>
                <ChatAvatar peerId={me.id} title={meName} hasPhoto={true} size={38} />
                <div className="min-w-0 flex-1 overflow-hidden">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold leading-tight">{meName}</span>
                    {totalUnread > 0 && (
                      <span className="ml-auto shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
                        {totalUnread > 999 ? "999+" : totalUnread}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground leading-tight mt-0.5">
                    {me.username ? `@${me.username}` : me.phone ? `+${me.phone}` : ""}
                  </div>
                </div>

                {/* Stealth mode toggle — 44px touch target */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setStealthMode((v) => !v)}
                  title={stealthMode ? "Stealth ON — not sending read receipts (Ctrl+L)" : "Stealth OFF — sending read receipts (Ctrl+L)"}
                  className={cn("h-10 w-10 shrink-0", stealthMode ? "text-amber-500 hover:text-amber-600" : "text-muted-foreground hover:text-foreground")}
                >
                  {stealthMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>

                <ThemeToggle />

                {/* More menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-muted-foreground hover:text-foreground">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => setShowShortcuts(true)}>
                      <Keyboard className="mr-2 h-4 w-4" />
                      Keyboard shortcuts
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href="/admin">
                        <Lock className="mr-2 h-4 w-4" />
                        Admin panel
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setShowLogoutDialog(true)}
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Log out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
              onSelect={handleSelect}
            />
          </div>
        </aside>

        {/* ── Main content ─────────────────────────────────────────── */}
        <main
          className={cn(
            "flex min-w-0 flex-col",
            // Mobile: absolutely positioned to the right of the sidebar, slides in/out
            "absolute inset-y-0 left-0 w-full",
            // Desktop: normal flex child, takes remaining space
            "md:relative md:inset-auto md:flex-1",
            // Slide transition — mirrors the sidebar so both animate simultaneously
            "transition-transform duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
            "md:!translate-x-0",
            selected ? "translate-x-0" : "translate-x-full",
          )}
        >
          {selected ? (
            <MessageView
              key={`${selected.type}-${selected.id}`}
              dialog={selected}
              onBack={handleBack}
              stealthMode={stealthMode}
            />
          ) : (
            <DiscoverPage onSelect={handleSelect} />
          )}
        </main>
      </div>

      {/* Modals */}
      <KeyboardShortcutsModal open={showShortcuts} onClose={() => setShowShortcuts(false)} />

      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Log out of Telegram?</AlertDialogTitle>
            <AlertDialogDescription>
              Your session will be removed from this server. You can log back in at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loggingOut}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={loggingOut}
              onClick={async (e) => {
                e.preventDefault();
                setLoggingOut(true);
                try {
                  await api.logout();
                  queryClient.clear();
                  window.location.reload();
                } catch {
                  setLoggingOut(false);
                  setShowLogoutDialog(false);
                }
              }}
            >
              {loggingOut ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
              Log out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
      <div className="h-dvh flex w-screen items-center justify-center bg-muted/30">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data?.authenticated) return <Login />;
  return <ChatApp impersonating={data.impersonating ?? false} />;
}

function Router() {
  return (
    <Switch>
      <Route path="/admin" component={AdminPage} />
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
