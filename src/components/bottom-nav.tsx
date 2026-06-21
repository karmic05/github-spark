import { Link } from "@tanstack/react-router";
import { PenLine, Scroll, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

const ITEMS = [
  { to: "/today", label: "Today", icon: PenLine },
  { to: "/timeline", label: "Timeline", icon: Scroll },
  { to: "/insights", label: "Reveal", icon: Sparkles },
] as const;

/** Minimal bottom nav — this is a phone-sized daily ritual. */
export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-md items-stretch justify-around px-2 py-1.5">
        {ITEMS.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="group flex flex-1 flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-muted-foreground transition-colors"
            activeProps={{ className: "text-primary" }}
          >
            <Icon className="h-5 w-5" strokeWidth={1.75} />
            <span className="text-[11px] font-medium tracking-wide">{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
