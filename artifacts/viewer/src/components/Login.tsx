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
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <MessageSquare className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Sign in to Telegram</h1>
            <p className="mt-1 text-xs text-muted-foreground">
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
              <label className="mb-1 block text-xs font-medium">
                Phone number
              </label>
              <input
                type="tel"
                autoFocus
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 234 567 8900"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                disabled={busy}
              />
            </div>
          )}

          {step === "code" && (
            <>
              <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
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
                <label className="mb-1 block text-xs font-medium">
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
                  className="w-full rounded-md border bg-background px-3 py-2 text-center font-mono text-lg tracking-widest outline-none focus:border-primary"
                  disabled={busy}
                />
              </div>
            </>
          )}

          {step === "password" && (
            <>
              <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                Phone: <span className="font-medium">{phone}</span>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">
                  Password
                </label>
                <input
                  type="password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your 2FA password"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  disabled={busy}
                />
              </div>
            </>
          )}

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            {step === "phone" ? "Send code" : "Sign in"}
          </Button>
        </form>

        <p className="mt-4 text-center text-[10px] text-muted-foreground">
          Sessions are stored locally on this server. Never share your login code.
        </p>
      </div>
    </div>
  );
}
