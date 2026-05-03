import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

interface ShortcutRow {
  keys: string[];
  description: string;
}

interface Section {
  title: string;
  rows: ShortcutRow[];
}

const SECTIONS: Section[] = [
  {
    title: "Navigation",
    rows: [
      { keys: ["Ctrl", "K"], description: "Focus chat search" },
      { keys: ["Esc"], description: "Close current chat" },
      { keys: ["Alt", "↑ / ↓"], description: "Jump to previous / next chat" },
    ],
  },
  {
    title: "Messages",
    rows: [
      { keys: ["Ctrl", "F"], description: "Search within chat" },
      { keys: ["Enter"], description: "Send message (desktop)" },
      { keys: ["Shift", "Enter"], description: "New line in message" },
      { keys: ["Esc"], description: "Cancel reply" },
    ],
  },
  {
    title: "App",
    rows: [
      { keys: ["?"], description: "Show this shortcuts panel" },
      { keys: ["Ctrl", "L"], description: "Toggle stealth mode (no read receipts)" },
      { keys: ["Ctrl", "D"], description: "Toggle dark / light theme" },
    ],
  },
];

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground shadow-sm">
      {children}
    </kbd>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsModal({ open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-1">
          {SECTIONS.map((s) => (
            <div key={s.title}>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {s.title}
              </div>
              <div className="space-y-2">
                {s.rows.map((r) => (
                  <div key={r.description} className="flex items-center justify-between gap-4">
                    <span className="text-sm text-foreground/80">{r.description}</span>
                    <div className="flex shrink-0 items-center gap-1">
                      {r.keys.map((k, i) => (
                        <span key={i} className="flex items-center gap-1">
                          {i > 0 && <span className="text-muted-foreground">+</span>}
                          <Kbd>{k}</Kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-center text-[11px] text-muted-foreground">
          Press <Kbd>?</Kbd> anywhere to open this panel
        </p>
      </DialogContent>
    </Dialog>
  );
}
