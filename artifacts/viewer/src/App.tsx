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
import { MessageSquare, Loader2, LogOut, Moon, Sun } from "lucide-react";

const queryClient = new QueryClient();

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      data-testid="button-theme-toggle"
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
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
      onClick={() => {
        if (confirm("Log out of Telegram?")) m.mutate();
      }}
      disabled={m.isPending}
    >
      {m.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <LogOut className="h-4 w-4" />
      )}
    </Button>
  );
}

function ChatApp() {
  const [selected, setSelected] = useState<Dialog | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: api.me,
    staleTime: Infinity,
  });

  const { data: dialogsData } = useQuery({
    queryKey: ["dialogs"],
    queryFn: () => api.dialogs(150),
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  const dialogs = dialogsData?.dialogs ?? [];
  const totalUnread = dialogs.reduce((s, d) => s + d.unreadCount, 0);

  // Desktop notifications
  useDesktopNotifications(dialogs, setSelected);

  // Global keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Ctrl+K → focus chat search
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      // Escape → deselect chat (only when not in a text field)
      if (
        e.key === "Escape" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        setSelected(null);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const meName =
    [me?.firstName, me?.lastName].filter(Boolean).join(" ") ||
    me?.username ||
    "Me";

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <aside className="flex w-[340px] shrink-0 flex-col border-r bg-card">
        {/* Sidebar header */}
        <div className="flex items-center gap-2 border-b px-3 py-3">
          {me ? (
            <>
              <ChatAvatar
                peerId={me.id}
                title={meName}
                hasPhoto={true}
                size={40}
              />
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
                  {me.username
                    ? `@${me.username}`
                    : me.phone
                      ? `+${me.phone}`
                      : ""}
                </div>
              </div>
              <ThemeToggle />
              <LogoutButton />
            </>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          )}
        </div>

        {/* Chat list with search ref forwarded */}
        <div className="min-h-0 flex-1">
          <ChatList
            ref={searchRef}
            selectedId={selected?.id ?? null}
            onSelect={(d) => setSelected(d)}
          />
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {selected ? (
          <MessageView
            key={`${selected.type}-${selected.id}`}
            dialog={selected}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-muted/30 text-muted-foreground">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-card shadow-sm">
              <MessageSquare className="h-7 w-7" />
            </div>
            <div className="text-sm">Select a chat to view messages</div>
            <div className="text-xs text-muted-foreground/60">
              Press <kbd className="rounded border px-1 py-0.5 text-[10px] font-mono">Ctrl+K</kbd> to search chats
            </div>
          </div>
        )}
      </main>
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
      <div className="flex h-screen w-screen items-center justify-center bg-muted/30">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data?.authenticated) {
    return <Login />;
  }

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
