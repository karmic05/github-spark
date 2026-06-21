import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { PenLine, Radar, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUser } from "@/lib/use-user";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Throughline — your life, quietly written" },
      {
        name: "description",
        content:
          "A two-minute daily check-in that quietly writes your life story and shows you the patterns you can't see yourself.",
      },
    ],
  }),
  component: Landing,
});

const BEATS = [
  {
    icon: PenLine,
    title: "A two-minute ritual",
    body: "Write a few sentences about your day. The agent reads the tone and quietly remembers the people and themes that keep recurring.",
  },
  {
    icon: Sparkles,
    title: "It remembers",
    body: "Each time you return it greets you with something real from your past — a worry, a small win, a name. Proof that it's listening.",
  },
  {
    icon: Radar,
    title: "The reveal",
    body: "Over weeks it writes your private autobiography, then shows the patterns: recurring themes, the people who matter, your emotional arc, and a spider-web map of how your seasons feel.",
  },
];

function Landing() {
  const navigate = useNavigate();
  const { user, ready, signIn, signOut } = useUser();
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // We intentionally do NOT auto-redirect returning users — the landing page
  // should always be reachable. Returning users get a "Continue" button.
  const returning = ready && user;

  function begin() {
    const n = name.trim();
    if (!n) {
      inputRef.current?.focus();
      return;
    }
    signIn(n);
    navigate({ to: "/today" });
  }

  function focusStart() {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => inputRef.current?.focus(), 400);
  }

  return (
    <main className="min-h-screen">
      {/* Hero + onboarding */}
      <section className="mx-auto flex min-h-[88vh] max-w-xl flex-col items-center justify-center px-6 text-center">
        <div className="animate-rise">
          <p className="prose-serif text-sm uppercase tracking-[0.35em] text-muted-foreground">
            Throughline
          </p>
          <h1 className="prose-serif mt-6 text-balance text-4xl leading-tight text-foreground sm:text-5xl">
            Your life, quietly written.
          </h1>
          <p className="mx-auto mt-5 max-w-md text-balance text-base leading-relaxed text-muted-foreground sm:text-lg">
            A two-minute daily check-in that remembers the people and patterns you can't see
            yourself — and reflects them back to you.
          </p>

          {returning ? (
            <div className="mt-8 flex flex-col gap-3">
              <Button
                onClick={() => navigate({ to: "/today" })}
                className="h-12 rounded-xl text-base"
              >
                Continue as {user!.name}
              </Button>
              <button
                onClick={() => {
                  signOut();
                  setName("");
                  inputRef.current?.focus();
                }}
                className="text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                Not you? Start fresh
              </button>
            </div>
          ) : (
            <div className="mt-8 flex flex-col gap-3">
              <Input
                ref={inputRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && begin()}
                placeholder="What should I call you?"
                className="h-12 rounded-xl text-center text-base"
                aria-label="Your name"
              />
              <Button onClick={begin} className="h-12 rounded-xl text-base">
                Begin
              </Button>
            </div>
          )}
          <p className="mt-5 text-xs text-muted-foreground">
            Private to this device. No account needed.
          </p>
        </div>
      </section>

      {/* What it does */}
      <section className="border-t border-border/60 bg-card/30">
        <div className="mx-auto max-w-2xl px-6 py-16">
          <h2 className="prose-serif text-center text-sm uppercase tracking-[0.25em] text-muted-foreground">
            How it works
          </h2>
          <div className="mt-10 grid gap-8">
            {BEATS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-4">
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: "oklch(0.93 0.03 72)" }}
                >
                  <Icon className="h-5 w-5 text-primary" strokeWidth={1.75} aria-hidden />
                </div>
                <div>
                  <h3 className="prose-serif text-lg text-foreground">{title}</h3>
                  <p className="mt-1.5 text-pretty text-sm leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <Button
              onClick={returning ? () => navigate({ to: "/today" }) : focusStart}
              variant="secondary"
              className="h-11 rounded-xl px-8"
            >
              {returning ? "Open your journal" : "Start your throughline"}
            </Button>
            <p className="prose-serif mt-10 text-pretty text-base italic leading-relaxed text-muted-foreground">
              “Running shows up on almost every good day. Conversations with one person warmed up
              over time. Your hardest weeks all mention sleep.”
            </p>
            <p className="mt-2 text-xs uppercase tracking-widest text-muted-foreground">
              the kind of thing it notices
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
