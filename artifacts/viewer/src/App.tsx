import { useState } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { ChatList } from "@/components/ChatList";
import { MessageView } from "@/components/MessageView";
import { ChatAvatar } from "@/components/Avatar";
import { api, type Dialog } from "@/lib/api";
import { MessageSquare, Loader2 } from "lucide-react";

const queryClient = new QueryClient();

function Home() {
  const [selected, setSelected] = useState<Dialog | null>(null);
  const { data: me, isLoading: meLoading, error: meError } = useQuery({
    queryKey: ["me"],
    queryFn: api.me,
    staleTime: Infinity,
  });

  const meName =
    [me?.firstName, me?.lastName].filter(Boolean).join(" ") || me?.username || "Me";

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <aside className="flex w-[340px] shrink-0 flex-col border-r bg-card">
        <div className="flex items-center gap-3 border-b px-4 py-3">
          {meLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Connecting…
            </div>
          ) : me ? (
            <>
              <ChatAvatar
                peerId={me.id}
                title={meName}
                hasPhoto={true}
                size={40}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{meName}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {me.username ? `@${me.username}` : me.phone ? `+${me.phone}` : ""}
                </div>
              </div>
            </>
          ) : (
            <div className="text-sm text-destructive">
              {(meError as Error)?.message ?? "Not connected"}
            </div>
          )}
        </div>
        <div className="min-h-0 flex-1">
          <ChatList
            selectedId={selected?.id ?? null}
            onSelect={(d) => setSelected(d)}
          />
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {selected ? (
          <MessageView key={`${selected.type}-${selected.id}`} dialog={selected} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-muted/30 text-muted-foreground">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-card shadow-sm">
              <MessageSquare className="h-7 w-7" />
            </div>
            <div className="text-sm">Select a chat to view messages</div>
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
