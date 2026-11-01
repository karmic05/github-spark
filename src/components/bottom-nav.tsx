import { Link } from "@tanstack/react-router";
import { PenLine, Scroll, Sparkles } from "lucide-react";

const ITEMS = [
  { to: "/today", label: "Today", icon: PenLine },
  { to: "/timeline", label: "Timeline", icon: Scroll },
  { to: "/insights", label: "Reveal", icon: Sparkles },
] as const;

/** A flat tab bar on a hairline: this is a phone-sized daily ritual. */
export function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-foreground/15 bg-background pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      <div className="mx-auto grid max-w-xl grid-cols-3">
        {ITEMS.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="press group relative flex flex-col items-center gap-1 py-3 text-muted-foreground transition-colors duration-150 [@media(hover:hover)]:hover:text-foreground"
            activeProps={{ className: "!text-foreground [&_.tab-mark]:scale-100" }}
          >
            <span
              aria-hidden
              className="tab-mark absolute left-1/2 top-0 h-[3px] w-8 -translate-x-1/2 scale-x-0 bg-vermilion transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]"
             
            />
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.6} />
            <span className="font-mono text-[11px] tracking-wide">{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
