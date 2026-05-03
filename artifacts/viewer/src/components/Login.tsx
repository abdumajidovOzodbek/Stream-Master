import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import QRCode from "react-qr-code";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Loader2, Send, MessageSquare, QrCode, Phone } from "lucide-react";

type Step = "phone" | "code" | "password";
type LoginMode = "phone" | "qr";
type QrStep = "loading" | "ready" | "needsPassword" | "error";

type QrEvent =
  | { type: "qr"; url: string; expires: number }
  | { type: "needsPassword" }
  | { type: "success" }
  | { type: "error"; message: string };

export function Login() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<LoginMode>("phone");

  // ── Phone login state ────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [phoneCodeHash, setPhoneCodeHash] = useState("");
  const [error, setError] = useState<string | null>(null);

  // ── QR login state ───────────────────────────────────────────────────────
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrStep, setQrStep] = useState<QrStep>("loading");
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrPassword, setQrPassword] = useState("");
  const sseRef = useRef<EventSource | null>(null);
  /** True only after qrStart() resolved — guards against cancelling a session that never opened */
  const qrActiveRef = useRef(false);
  /** Increments on every stopQr() so stale async completions can detect they are obsolete */
  const qrGenRef = useRef(0);

  // ── Start / stop QR flow ─────────────────────────────────────────────────
  function stopQr() {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    if (qrActiveRef.current) {
      qrActiveRef.current = false;
      api.qrCancel().catch(() => undefined);
    }
    qrGenRef.current += 1;
  }

  function startQr() {
    setQrStep("loading");
    setQrUrl(null);
    setQrError(null);
    setQrPassword("");

    const gen = qrGenRef.current;

    void api.qrStart()
      .then(() => {
        // Bail out if mode was switched or component unmounted while awaiting qrStart
        if (qrGenRef.current !== gen) return;
        qrActiveRef.current = true;
        const sessionId = api.getSessionId();
        const url = `/api/auth/qr/events?sid=${encodeURIComponent(sessionId)}`;
        const es = new EventSource(url);
        sseRef.current = es;

        es.onmessage = (e) => {
          let event: QrEvent;
          try {
            event = JSON.parse(e.data as string) as QrEvent;
          } catch {
            return;
          }

          if (event.type === "qr") {
            setQrUrl(event.url);
            setQrStep("ready");
          } else if (event.type === "needsPassword") {
            setQrStep("needsPassword");
          } else if (event.type === "success") {
            es.close();
            sseRef.current = null;
            qrActiveRef.current = false;
            void qc.invalidateQueries({ queryKey: ["auth-status"] });
            void qc.invalidateQueries({ queryKey: ["me"] });
            void qc.invalidateQueries({ queryKey: ["dialogs"] });
          } else if (event.type === "error") {
            es.close();
            sseRef.current = null;
            qrActiveRef.current = false;
            setQrStep("error");
            setQrError(event.message);
          }
        };

        es.onerror = () => {
          es.close();
          sseRef.current = null;
          if (qrActiveRef.current) {
            qrActiveRef.current = false;
            api.qrCancel().catch(() => undefined);
          }
          setQrStep("error");
          setQrError("Connection to server lost. Please try again.");
        };
      })
      .catch((err: unknown) => {
        setQrStep("error");
        setQrError(err instanceof Error ? err.message : "Failed to start QR login");
      });
  }

  useEffect(() => {
    if (mode === "qr") {
      startQr();
    } else {
      stopQr();
    }
    return () => {
      stopQr();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // ── 2FA password for QR flow ─────────────────────────────────────────────
  const submitQrPasswordMutation = useMutation({
    mutationFn: () => api.qrPassword(qrPassword),
    onSuccess: () => {
      setQrPassword("");
    },
    onError: (e) => {
      setQrError((e as Error).message);
    },
  });

  // ── Phone login mutations ────────────────────────────────────────────────
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

  function handleCodeChange(value: string) {
    const digits = value.replace(/\D/g, "");
    setCode(digits);
    if (digits.length === 5 && !signIn.isPending) {
      setTimeout(() => signIn.mutate(), 0);
    }
  }

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
        {/* Header */}
        <div className="mb-6 flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
            <MessageSquare className="h-8 w-8" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Sign in to Telegram</h1>
        </div>

        {/* Mode toggle */}
        <div className="mb-6 flex rounded-xl border p-1 gap-1">
          <button
            type="button"
            onClick={() => setMode("phone")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors ${
              mode === "phone"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Phone className="h-4 w-4" />
            Phone
          </button>
          <button
            type="button"
            onClick={() => setMode("qr")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors ${
              mode === "qr"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <QrCode className="h-4 w-4" />
            QR code
          </button>
        </div>

        {/* ── QR mode ── */}
        {mode === "qr" && (
          <div className="flex flex-col items-center gap-4">
            {qrStep === "loading" && (
              <div className="flex h-48 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}

            {qrStep === "ready" && qrUrl && (
              <>
                <p className="text-center text-sm text-muted-foreground">
                  Open Telegram on your phone, go to{" "}
                  <strong>Settings → Devices → Link Desktop Device</strong> and scan this code.
                </p>
                <div className="rounded-2xl border bg-white p-4 shadow-sm">
                  <QRCode value={qrUrl} size={192} />
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  The code refreshes automatically before it expires.
                </p>
              </>
            )}

            {qrStep === "needsPassword" && (
              <>
                <p className="text-center text-sm text-muted-foreground">
                  Two-step verification is enabled. Enter your password to continue.
                </p>
                <form
                  className="w-full space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (qrPassword) submitQrPasswordMutation.mutate();
                  }}
                >
                  <div>
                    <label className="mb-1.5 block text-sm font-medium">Password</label>
                    <input
                      type="password"
                      autoFocus
                      value={qrPassword}
                      onChange={(e) => setQrPassword(e.target.value)}
                      placeholder="Your 2FA password"
                      className="h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                      disabled={submitQrPasswordMutation.isPending}
                    />
                  </div>
                  {qrError && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                      {qrError}
                    </div>
                  )}
                  <Button
                    type="submit"
                    className="h-11 w-full text-sm"
                    disabled={submitQrPasswordMutation.isPending}
                  >
                    {submitQrPasswordMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Confirm
                  </Button>
                </form>
              </>
            )}

            {qrStep === "error" && (
              <>
                <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive text-center w-full">
                  {qrError ?? "QR login failed. Please try again."}
                </div>
                <Button
                  variant="outline"
                  className="h-11 w-full text-sm"
                  onClick={() => { stopQr(); startQr(); }}
                >
                  Try again
                </Button>
              </>
            )}
          </div>
        )}

        {/* ── Phone mode ── */}
        {mode === "phone" && (
          <>
            <p className="mb-4 text-center text-sm text-muted-foreground">
              {step === "phone" && "Enter your phone number with country code."}
              {step === "code" && "We sent a code to your Telegram app. Enter it below."}
              {step === "password" && "Two-step verification is enabled. Enter your password."}
            </p>

            <form onSubmit={onSubmit} className="space-y-3">
              {step === "phone" && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Phone number</label>
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
                    <label className="mb-1.5 block text-sm font-medium">Login code</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoFocus
                      value={code}
                      onChange={(e) => handleCodeChange(e.target.value)}
                      placeholder="12345"
                      maxLength={5}
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
                    <label className="mb-1.5 block text-sm font-medium">Password</label>
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
          </>
        )}

        <p className="mt-5 text-center text-xs text-muted-foreground">
          Sessions are stored locally on this server. Never share your login code.
        </p>
      </div>
    </div>
  );
}
