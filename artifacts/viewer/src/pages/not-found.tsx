import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-lg">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-8 w-8 shrink-0 text-destructive" />
          <h1 className="text-2xl font-bold text-foreground">404 — Page Not Found</h1>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          This page doesn't exist. Did you forget to add it to the router?
        </p>
      </div>
    </div>
  );
}
