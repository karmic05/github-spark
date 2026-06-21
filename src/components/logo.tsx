import { cn } from "@/lib/utils";

/**
 * The Throughline mark: a single continuous line that threads upward through
 * three nodes — days connecting into one rising story. Uses currentColor, so
 * set the color with a text-* class (e.g. text-primary).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden focusable="false">
      <path
        d="M5 23 C 10 23 11 17 16 16 S 22 11 27 9"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      <circle cx="5" cy="23" r="2.3" fill="currentColor" />
      <circle cx="16" cy="16" r="2.3" fill="currentColor" />
      <circle cx="27" cy="9" r="2.3" fill="currentColor" />
    </svg>
  );
}

/** The mark paired with the wordmark. */
export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className="h-7 w-7 text-primary" />
      <span className="prose-serif text-xl tracking-tight text-foreground">Throughline</span>
    </div>
  );
}
