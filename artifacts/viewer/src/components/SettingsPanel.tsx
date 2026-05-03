import { useRef, useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  settingsApi,
  type PrivacyValue,
  type PrivacyKey,
  type SessionInfo,
  type BlockedUser,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ChatAvatar } from "@/components/Avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronRight,
  Eye,
  Globe,
  Key,
  Loader2,
  LogOut,
  Monitor,
  Pencil,
  Phone,
  Shield,
  Smartphone,
  User,
  UserX,
  X,
} from "lucide-react";

type Section = "profile" | "privacy" | "sessions" | "blocked" | "2fa";

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function timeAgo(unix: number): string {
  const diff = Math.floor(Date.now() / 1000) - unix;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 30 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(unix * 1000).toLocaleDateString();
}

function privacyLabel(v: PrivacyValue): string {
  if (v === "everyone") return "Everyone";
  if (v === "contacts") return "My contacts";
  return "Nobody";
}

function deviceIcon(platform: string) {
  const p = platform.toLowerCase();
  if (p.includes("ios") || p.includes("android")) return <Smartphone className="h-5 w-5" />;
  return <Monitor className="h-5 w-5" />;
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1 border-b px-2 py-2">
      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <span className="text-sm font-semibold">{title}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile section
// ---------------------------------------------------------------------------

function ProfileSection({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["settings", "profile"],
    queryFn: settingsApi.getProfile,
    staleTime: 30_000,
  });

  const [editing, setEditing] = useState<"name" | "bio" | "username" | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [bio, setBio] = useState("");
  const [username, setUsername] = useState("");

  function startEdit(field: "name" | "bio" | "username") {
    if (!profile) return;
    if (field === "name") { setFirstName(profile.firstName); setLastName(profile.lastName); }
    if (field === "bio") setBio(profile.bio);
    if (field === "username") setUsername(profile.username);
    setEditing(field);
  }

  const updateProfileMut = useMutation({
    mutationFn: settingsApi.updateProfile,
    onSuccess: () => {
      toast({ description: "Profile updated" });
      void qc.invalidateQueries({ queryKey: ["settings", "profile"] });
      void qc.invalidateQueries({ queryKey: ["me"] });
      setEditing(null);
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });

  const updateUsernameMut = useMutation({
    mutationFn: settingsApi.updateUsername,
    onSuccess: () => {
      toast({ description: "Username updated" });
      void qc.invalidateQueries({ queryKey: ["settings", "profile"] });
      void qc.invalidateQueries({ queryKey: ["me"] });
      setEditing(null);
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });

  const uploadPhotoMut = useMutation({
    mutationFn: settingsApi.uploadPhoto,
    onSuccess: () => {
      toast({ description: "Profile photo updated" });
      void qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });

  function saveEdit() {
    if (!profile) return;
    if (editing === "name") updateProfileMut.mutate({ firstName, lastName });
    if (editing === "bio") updateProfileMut.mutate({ bio });
    if (editing === "username") updateUsernameMut.mutate(username);
  }

  const saving = updateProfileMut.isPending || updateUsernameMut.isPending;
  const displayName = profile
    ? `${profile.firstName} ${profile.lastName}`.trim() || profile.username || "Me"
    : "Loading…";

  return (
    <div className="flex flex-col h-full">
      <SectionHeader title="Edit Profile" onBack={onBack} />

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-5">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              {isLoading ? (
                <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <ChatAvatar peerId="me" title={displayName} hasPhoto size={80} />
              )}
              <button
                type="button"
                className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow hover:bg-primary/90 transition-colors"
                title="Change photo"
                disabled={uploadPhotoMut.isPending}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadPhotoMut.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Camera className="h-3.5 w-3.5" />}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadPhotoMut.mutate(file);
                  e.target.value = "";
                }}
              />
            </div>
            <span className="text-sm font-semibold">{displayName}</span>
          </div>

          <Separator />

          {/* Name field */}
          {editing === "name" ? (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</label>
              <input
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
                autoFocus
              />
              <input
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name (optional)"
              />
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={saveEdit} disabled={saving}>
                  {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
                  <X className="mr-1.5 h-3.5 w-3.5" /> Cancel
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 hover:bg-muted/50 transition-colors text-left group"
              onClick={() => startEdit("name")}
            >
              <div>
                <div className="text-xs text-muted-foreground">Name</div>
                <div className="text-sm font-medium">
                  {profile ? `${profile.firstName} ${profile.lastName}`.trim() || "–" : "–"}
                </div>
              </div>
              <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}

          <Separator />

          {/* Bio field */}
          {editing === "bio" ? (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Bio</label>
              <textarea
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Add a bio…"
                maxLength={70}
                autoFocus
              />
              <div className="text-xs text-muted-foreground text-right">{bio.length}/70</div>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveEdit} disabled={saving}>
                  {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
                  <X className="mr-1.5 h-3.5 w-3.5" /> Cancel
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 hover:bg-muted/50 transition-colors text-left group"
              onClick={() => startEdit("bio")}
            >
              <div>
                <div className="text-xs text-muted-foreground">Bio</div>
                <div className="text-sm">{profile?.bio || <span className="text-muted-foreground italic">Add a bio</span>}</div>
              </div>
              <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}

          <Separator />

          {/* Username field */}
          {editing === "username" ? (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Username</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                <input
                  className="w-full rounded-md border bg-background pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                  placeholder="username"
                  autoFocus
                />
              </div>
              <div className="text-xs text-muted-foreground">
                5–32 characters: a–z, 0–9, and underscores.
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveEdit} disabled={updateUsernameMut.isPending}>
                  {updateUsernameMut.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                  <X className="mr-1.5 h-3.5 w-3.5" /> Cancel
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 hover:bg-muted/50 transition-colors text-left group"
              onClick={() => startEdit("username")}
            >
              <div>
                <div className="text-xs text-muted-foreground">Username</div>
                <div className="text-sm">
                  {profile?.username ? `@${profile.username}` : <span className="text-muted-foreground italic">None</span>}
                </div>
              </div>
              <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}

          <Separator />

          {/* Phone (read-only) */}
          <div className="px-1 py-1.5">
            <div className="text-xs text-muted-foreground">Phone</div>
            <div className="text-sm flex items-center gap-1.5 mt-0.5">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              {profile?.phone ? `+${profile.phone}` : "–"}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Privacy section
// ---------------------------------------------------------------------------

const PRIVACY_ITEMS: { key: PrivacyKey; label: string; description: string }[] = [
  { key: "lastSeen", label: "Last seen & online", description: "Who can see when you were last online" },
  { key: "profilePhoto", label: "Profile photo", description: "Who can see your profile photo" },
  { key: "phone", label: "Phone number", description: "Who can see your phone number" },
  { key: "forwards", label: "Forwarded messages", description: "Who can link to your account when forwarding your messages" },
  { key: "calls", label: "Voice & video calls", description: "Who can call you" },
];

function PrivacySection({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: privacy, isLoading } = useQuery({
    queryKey: ["settings", "privacy"],
    queryFn: settingsApi.getPrivacy,
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: ({ key, value }: { key: PrivacyKey; value: PrivacyValue }) =>
      settingsApi.setPrivacy(key, value),
    onSuccess: (_data, { key, value }) => {
      toast({ description: `${PRIVACY_ITEMS.find((i) => i.key === key)?.label ?? key} set to ${privacyLabel(value)}` });
      void qc.invalidateQueries({ queryKey: ["settings", "privacy"] });
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });

  return (
    <div className="flex flex-col h-full">
      <SectionHeader title="Privacy" onBack={onBack} />

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-1">
          <p className="text-xs text-muted-foreground pb-2">
            Control who can see your personal information on Telegram.
          </p>

          {PRIVACY_ITEMS.map((item, i) => (
            <div key={item.key}>
              {i > 0 && <Separator className="my-3" />}
              <div className="space-y-1.5">
                <div>
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className="text-xs text-muted-foreground">{item.description}</div>
                </div>
                {isLoading ? (
                  <div className="h-9 w-full rounded-md bg-muted animate-pulse" />
                ) : (
                  <Select
                    value={privacy?.[item.key]}
                    onValueChange={(v) =>
                      mutation.mutate({ key: item.key, value: v as PrivacyValue })
                    }
                    disabled={mutation.isPending}
                  >
                    <SelectTrigger className="w-full text-sm">
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="everyone">Everyone</SelectItem>
                      <SelectItem value="contacts">My contacts</SelectItem>
                      <SelectItem value="nobody">Nobody</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sessions section
// ---------------------------------------------------------------------------

function SessionCard({
  session,
  onTerminate,
  terminating,
}: {
  session: SessionInfo;
  onTerminate: () => void;
  terminating: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5 space-y-1.5",
        session.isCurrent && "border-primary/40 bg-primary/5",
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 text-muted-foreground shrink-0">
          {deviceIcon(session.platform)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium truncate">{session.deviceModel || session.appName}</span>
            {session.isCurrent && (
              <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white shrink-0">
                Current
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {session.appName} {session.appVersion}
          </div>
          <div className="text-xs text-muted-foreground">
            {session.ip} · {session.country}
            {session.region ? `, ${session.region}` : ""}
          </div>
          <div className="text-xs text-muted-foreground">
            Active: {timeAgo(session.dateActive)}
          </div>
        </div>
        {!session.isCurrent && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
            title="Terminate session"
            onClick={onTerminate}
            disabled={terminating}
          >
            {terminating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
          </Button>
        )}
      </div>
    </div>
  );
}

function SessionsSection({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [terminatingHash, setTerminatingHash] = useState<string | null>(null);
  const [terminatingAll, setTerminatingAll] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["settings", "sessions"],
    queryFn: settingsApi.getSessions,
    staleTime: 30_000,
  });

  const sessions = data?.sessions ?? [];
  const current = sessions.find((s) => s.isCurrent);
  const others = sessions.filter((s) => !s.isCurrent);

  async function handleTerminate(hash: string) {
    setTerminatingHash(hash);
    try {
      await settingsApi.terminateSession(hash);
      toast({ description: "Session terminated" });
      void refetch();
      void qc.invalidateQueries({ queryKey: ["settings", "sessions"] });
    } catch (e) {
      toast({ variant: "destructive", description: (e as Error).message });
    } finally {
      setTerminatingHash(null);
    }
  }

  async function handleTerminateAll() {
    setTerminatingAll(true);
    try {
      await settingsApi.terminateAllOtherSessions();
      toast({ description: "All other sessions terminated" });
      void refetch();
    } catch (e) {
      toast({ variant: "destructive", description: (e as Error).message });
    } finally {
      setTerminatingAll(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <SectionHeader title="Active Sessions" onBack={onBack} />

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-4">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              {current && (
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    This device
                  </div>
                  <SessionCard session={current} onTerminate={() => {}} terminating={false} />
                </div>
              )}

              {others.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Other sessions ({others.length})
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => void handleTerminateAll()}
                      disabled={terminatingAll}
                    >
                      {terminatingAll
                        ? <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        : <LogOut className="mr-1 h-3 w-3" />}
                      Terminate all
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {others.map((s) => (
                      <SessionCard
                        key={s.hash}
                        session={s}
                        onTerminate={() => void handleTerminate(s.hash)}
                        terminating={terminatingHash === s.hash}
                      />
                    ))}
                  </div>
                </div>
              )}

              {others.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <Shield className="h-8 w-8 text-emerald-500" />
                  <div className="text-sm font-medium">No other active sessions</div>
                  <div className="text-xs text-muted-foreground">
                    Your account is only logged in on this device.
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Blocked users section
// ---------------------------------------------------------------------------

function BlockedSection({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["settings", "blocked"],
    queryFn: settingsApi.getBlocked,
    staleTime: 60_000,
  });

  const users: BlockedUser[] = data?.users ?? [];

  async function handleUnblock(user: BlockedUser) {
    setUnblockingId(user.id);
    try {
      await settingsApi.unblock(user.id);
      toast({ description: `${user.name} unblocked` });
      void refetch();
      void qc.invalidateQueries({ queryKey: ["settings", "blocked"] });
    } catch (e) {
      toast({ variant: "destructive", description: (e as Error).message });
    } finally {
      setUnblockingId(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <SectionHeader title="Blocked Users" onBack={onBack} />

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-2">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <UserX className="h-8 w-8 text-muted-foreground" />
              <div className="text-sm font-medium">No blocked users</div>
              <div className="text-xs text-muted-foreground">
                You haven't blocked anyone.
              </div>
            </div>
          ) : (
            users.map((user) => (
              <div
                key={user.id}
                className="flex items-center gap-3 rounded-lg border px-3 py-2.5"
              >
                <ChatAvatar peerId={user.id} title={user.name} hasPhoto size={36} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{user.name}</div>
                  {user.username && (
                    <div className="text-xs text-muted-foreground">@{user.username}</div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs shrink-0"
                  onClick={() => void handleUnblock(user)}
                  disabled={unblockingId === user.id}
                >
                  {unblockingId === user.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : "Unblock"}
                </Button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Two-step verification section
// ---------------------------------------------------------------------------

function TwoFASection({ onBack }: { onBack: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["settings", "2fa"],
    queryFn: settingsApi.get2FA,
    staleTime: 60_000,
  });

  return (
    <div className="flex flex-col h-full">
      <SectionHeader title="Two-Step Verification" onBack={onBack} />

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-4">
          {isLoading ? (
            <div className="space-y-2">
              <div className="h-16 rounded-lg bg-muted animate-pulse" />
              <div className="h-8 rounded bg-muted animate-pulse" />
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <div
                  className={cn(
                    "flex h-14 w-14 items-center justify-center rounded-full",
                    data?.hasPassword
                      ? "bg-emerald-100 dark:bg-emerald-900/30"
                      : "bg-muted",
                  )}
                >
                  <Key
                    className={cn(
                      "h-7 w-7",
                      data?.hasPassword
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-muted-foreground",
                    )}
                  />
                </div>
                <div>
                  <div className="text-sm font-semibold">
                    {data?.hasPassword
                      ? "Two-step verification is enabled"
                      : "Two-step verification is disabled"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {data?.hasPassword
                      ? "Your account is protected by a password in addition to your SMS code."
                      : "Add an extra layer of security to your account."}
                  </div>
                </div>
              </div>

              {data?.hasPassword && data.hint && (
                <div className="rounded-lg border px-3 py-2.5">
                  <div className="text-xs text-muted-foreground">Password hint</div>
                  <div className="text-sm font-medium">{data.hint}</div>
                </div>
              )}

              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-800 dark:bg-amber-900/20">
                <div className="flex items-start gap-2">
                  <Shield className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="text-xs text-amber-800 dark:text-amber-300">
                    To change or remove your two-step verification password, please use the official Telegram app on your phone or desktop.
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main settings menu
// ---------------------------------------------------------------------------

interface MenuItem {
  key: Section;
  icon: React.ReactNode;
  label: string;
  description: string;
}

const MENU_ITEMS: MenuItem[] = [
  { key: "profile", icon: <User className="h-4 w-4" />, label: "Edit Profile", description: "Name, bio, username, photo" },
  { key: "privacy", icon: <Eye className="h-4 w-4" />, label: "Privacy", description: "Last seen, calls, messages" },
  { key: "sessions", icon: <Monitor className="h-4 w-4" />, label: "Active Sessions", description: "Manage logged-in devices" },
  { key: "blocked", icon: <UserX className="h-4 w-4" />, label: "Blocked Users", description: "Users you've blocked" },
  { key: "2fa", icon: <Key className="h-4 w-4" />, label: "Two-Step Verification", description: "Password protection" },
];

function MainMenu({ onBack, onNavigate }: { onBack: () => void; onNavigate: (s: Section) => void }) {
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => fetch("/api/me", { headers: { "X-Session-ID": localStorage.getItem("tg_session_id") ?? "" } }).then(r => r.json()) as Promise<{ id?: string; firstName?: string; lastName?: string; username?: string }>, staleTime: Infinity });
  const meName = me ? `${me.firstName ?? ""} ${me.lastName ?? ""}`.trim() || me.username || "Me" : "Me";

  return (
    <div className="flex flex-col h-full">
      <div className="flex shrink-0 items-center gap-1 border-b px-2 py-2">
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold">Settings</span>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-4">
          {/* Profile preview card */}
          <div className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-3">
            <ChatAvatar peerId="me" title={meName} hasPhoto size={48} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold truncate">{meName}</div>
              {me?.username && (
                <div className="text-xs text-muted-foreground">@{me.username}</div>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground"
              onClick={() => onNavigate("profile")}
              title="Edit profile"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>

          <Separator />

          {/* Navigation items */}
          <div className="space-y-0.5">
            {MENU_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/60 transition-colors text-left"
                onClick={() => onNavigate(item.key)}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className="text-xs text-muted-foreground truncate">{item.description}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>

          <Separator />

          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Globe className="h-3.5 w-3.5" />
              Telegram account settings
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root export
// ---------------------------------------------------------------------------

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<Section | null>(null);

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-sidebar">
      {section === null && (
        <MainMenu onBack={onClose} onNavigate={setSection} />
      )}
      {section === "profile" && (
        <ProfileSection onBack={() => setSection(null)} />
      )}
      {section === "privacy" && (
        <PrivacySection onBack={() => setSection(null)} />
      )}
      {section === "sessions" && (
        <SessionsSection onBack={() => setSection(null)} />
      )}
      {section === "blocked" && (
        <BlockedSection onBack={() => setSection(null)} />
      )}
      {section === "2fa" && (
        <TwoFASection onBack={() => setSection(null)} />
      )}
    </div>
  );
}
