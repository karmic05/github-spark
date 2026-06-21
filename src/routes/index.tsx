import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

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
  component: Onboarding,
});

function Onboarding() {
  const navigate = useNavigate();
  const { user, ready, signIn } = useUser();
  const [name, setName] = useState("");

  // Already onboarded → straight to the daily ritual.
  useEffect(() => {
    if (ready && user) navigate({ to: "/today" });
  }, [ready, user, navigate]);

  function begin() {
    const n = name.trim();
    if (!n) return;
    signIn(n);
    navigate({ to: "/today" });
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-md animate-rise text-center">
        <p className="prose-serif text-sm uppercase tracking-[0.3em] text-muted-foreground">
          Throughline
        </p>
        <h1 className="prose-serif mt-6 text-3xl leading-snug text-foreground sm:text-4xl">
          What should I call you?
        </h1>
        <p className="mt-4 text-balance text-sm leading-relaxed text-muted-foreground">
          A few sentences a day. Over weeks, I quietly write your story back to you — the people,
          the patterns, the throughline.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && begin()}
            placeholder="Your name"
            className="h-12 rounded-xl text-center text-base"
            aria-label="Your name"
          />
          <Button onClick={begin} disabled={!name.trim()} className="h-12 rounded-xl text-base">
            Begin
          </Button>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Private to this device. No account needed.
        </p>
      </div>
    </main>
  );
}
