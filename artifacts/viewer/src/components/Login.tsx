import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Loader2, Send, MessageSquare } from "lucide-react";

type Step = "phone" | "code" | "password";

export function Login() {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [phoneCodeHash, setPhoneCodeHash] = useState("");
  const [error, setError] = useState<string | null>(null);

  const sendCode = useMutation({
    mutationFn: () => api.sendCode(phone.trim()),
    onSuccess: (r) => {
      setPhoneCodeHash(r.phoneCodeHash);
      setStep("code");
      setError(null);
    },
    onError: (e) => setError((e as Error).message),
  });

  const signIn = useMutation({
    mutationFn: () =>
      api.signIn({
        phone: phone.trim(),
        phoneCodeHash,
        code: code.trim(),
        ...(password ? { password } : {}),
      }),
    onSuccess: async (r) => {
      if (r.needsPassword) {
        setStep("password");
        setError(null);
        return;
      }
      setError(null);
      await qc.invalidateQueries({ queryKey: ["auth-status"] });
      await qc.invalidateQueries({ queryKey: ["me"] });
      await qc.invalidateQueries({ queryKey: ["dialogs"] });
    },
    onError: (e) => setError((e as Error).message),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (step === "phone") {
      if (!phone.trim()) return;
      sendCode.mutate();
    } else {
      if (!code.trim()) return;
      if (step === "password" && !password) return;
      signIn.mutate();
    }
  }

  const busy = sendCode.isPending || signIn.isPending;

  return (
    <div
      className="flex min-h-[100dvh] w-full items-start justify-center overflow-y-auto p-4 py-8 sm:items-center"
      style={{
        background:
          "radial-gradient(ellipse 80% 60% at 50% 0%, hsl(var(--primary) / 0.12), transparent 70%), hsl(var(--background))",
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border bg-card p-7 shadow-xl shadow-black/5 sm:p-8">
        <div className="mb-7 flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
            <MessageSquare className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Sign in to Telegram</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {step === "phone" && "Enter your phone number with country code."}
              {step === "code" &&
                "We sent a code to your Telegram app. Enter it below."}
              {step === "password" &&
                "Two-step verification is enabled. Enter your password."}
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          {step === "phone" && (
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Phone number
              </label>
              <input
                type="tel"
                autoFocus
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 234 567 8900"
                className="h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none ring-0 transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                disabled={busy}
              />
            </div>
          )}

          {step === "code" && (
            <>
              <div className="rounded-md bg-muted px-3 py-2.5 text-sm text-muted-foreground">
                Phone: <span className="font-medium">{phone}</span>
                <button
                  type="button"
                  className="ml-2 text-primary underline"
                  onClick={() => {
                    setStep("phone");
                    setCode("");
                    setPhoneCodeHash("");
                  }}
                >
                  change
                </button>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Login code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="12345"
                  maxLength={6}
                  className="h-11 w-full rounded-xl border bg-background px-3 text-center font-mono text-lg tracking-widest outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  disabled={busy}
                />
              </div>
            </>
          )}

          {step === "password" && (
            <>
              <div className="rounded-md bg-muted px-3 py-2.5 text-sm text-muted-foreground">
                Phone: <span className="font-medium">{phone}</span>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Password
                </label>
                <input
                  type="password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your 2FA password"
                  className="h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  disabled={busy}
                />
              </div>
            </>
          )}

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" className="h-11 w-full text-sm" disabled={busy}>
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            {step === "phone" ? "Send code" : "Sign in"}
          </Button>
        </form>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          Sessions are stored locally on this server. Never share your login code.
        </p>
      </div>
    </div>
  );
}
