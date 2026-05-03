import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChatAvatar } from "./Avatar";
import { Badge } from "@/components/ui/badge";
import { Loader2, Bot, BadgeCheck, Phone, AtSign, Info } from "lucide-react";
import { api } from "@/lib/api";
import { formatPresence } from "@/lib/format";
import type { Dialog as DialogType } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Props {
  peerId: string | null;
  peerDialog?: DialogType | null;
  open: boolean;
  onClose: () => void;
}

export function UserProfileCard({ peerId, peerDialog, open, onClose }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["user-info", peerId],
    queryFn: () => api.getUserInfo(peerId!),
    enabled: open && !!peerId,
    staleTime: 60_000,
  });

  const presence = peerDialog ? formatPresence(peerDialog.presence) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="sr-only">User profile</DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="py-6 text-center text-sm text-destructive">
            Could not load profile
          </div>
        )}

        {data && (
          <div className="flex flex-col items-center gap-4 pb-2 pt-2">
            {/* Avatar */}
            <div className="relative">
              <ChatAvatar
                peerId={data.id}
                title={data.name}
                hasPhoto={data.hasPhoto}
                size={80}
              />
              {peerDialog?.presence?.kind === "online" && (
                <span className="absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-background bg-emerald-500" />
              )}
            </div>

            {/* Name + badges */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-1.5 text-lg font-semibold">
                {data.name}
                {(peerDialog?.isVerified) && (
                  <BadgeCheck className="h-5 w-5 text-primary" />
                )}
                {data.isBot && (
                  <Badge variant="secondary" className="text-[10px]">
                    Bot
                  </Badge>
                )}
              </div>
              {presence?.label && (
                <p className={cn("mt-0.5 text-sm", presence.online ? "text-emerald-500" : "text-muted-foreground")}>
                  {presence.label}
                </p>
              )}
            </div>

            {/* Details */}
            <div className="w-full divide-y rounded-xl border">
              {data.username && (
                <div className="flex items-center gap-3 px-4 py-3">
                  <AtSign className="h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <div className="text-[11px] text-muted-foreground">Username</div>
                    <div className="text-sm">@{data.username}</div>
                  </div>
                </div>
              )}
              {data.phone && (
                <div className="flex items-center gap-3 px-4 py-3">
                  <Phone className="h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <div className="text-[11px] text-muted-foreground">Phone</div>
                    <div className="text-sm">{data.phone}</div>
                  </div>
                </div>
              )}
              {data.bio && (
                <div className="flex items-start gap-3 px-4 py-3">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <div className="text-[11px] text-muted-foreground">Bio</div>
                    <div className="whitespace-pre-wrap text-sm">{data.bio}</div>
                  </div>
                </div>
              )}
              {!data.username && !data.phone && !data.bio && (
                <div className="px-4 py-3 text-sm text-muted-foreground">
                  No additional info
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
