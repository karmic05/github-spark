import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { ArrowRight } from "lucide-react";

import { LiveDemo } from "@/components/live-demo";
import { LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";
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
    n: "01",
    title: "A two-minute ritual",
    body: "Write a few sentences about your day. The agent reads the tone and quietly remembers the people and themes that keep recurring.",
    src: "/shots/today-write.webp",
    alt: "The Today page: a ruled sheet of paper with a journal entry typed on it.",
  },
  {
    n: "02",
    title: "It remembers",
    body: "Each time you return it greets you with something real from your past — a worry, a small win, a name. Proof that it's listening.",
    src: "/shots/today-result.webp",
    alt: "The day's reading: a “a good day” stamp, a one-sentence reflection, tags for the people and themes, and an emotion radar.",
  },
  {
    n: "03",
    title: "The reveal",
    body: "Over weeks it writes your private autobiography, then shows the patterns: recurring themes, the people who matter, your emotional arc, and a spider-web map of how your seasons feel.",
    src: "/shots/reveal.webp",
    alt: "The Reveal page: a headline about the period and an overlaid radar of last week, last month and all time.",
  },
];

const UNDER_THE_HOOD = [
  ["Sentiment", "Qwen3-235B scores every entry on eight emotion axes plus an overall mood, as structured JSON."],
  ["Privacy", "Entries stay in your browser. The server only sees the text it is asked to read."],
  ["Stack", "TanStack Start, React 19, Tailwind v4, Nitro on Vercel. No database to run."],
  ["Tested", "30 end-to-end tests drive a real browser, including a battery of eight differently-toned entries."],
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
    <main className="min-h-screen overflow-x-clip">
      <div className="mx-auto max-w-6xl px-6 sm:px-10">
        {/* Masthead */}
        <header className="flex items-center justify-between border-b border-foreground/15 py-5">
          <div className="flex items-center gap-2.5">
            <LogoMark className="h-6 w-6 text-vermilion" />
            <span className="prose-serif text-xl tracking-tight">Throughline</span>
          </div>
          <nav className="label hidden gap-6 sm:flex" aria-label="Page sections">
            <a href="#demo" className="[@media(hover:hover)]:hover:text-foreground">
              Demo
            </a>
            <a href="#how" className="[@media(hover:hover)]:hover:text-foreground">
              Screens
            </a>
            <a href="#built" className="[@media(hover:hover)]:hover:text-foreground">
              Under the hood
            </a>
          </nav>
        </header>

        {/* Hero: the pitch on the left, the working product on the right. */}
        <section className="grid gap-12 pb-20 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-16 lg:pt-16">
          <div className="animate-rise">
            <p className="label">A journal that reads back</p>
            <h1 className="display mt-4 text-balance text-[2.9rem] sm:text-7xl">
              Your life,{" "}
              <em className="font-normal italic underline decoration-vermilion decoration-[3px] underline-offset-[0.12em] [text-decoration-skip-ink:none]">
                quietly written.
              </em>
            </h1>
            <p className="mt-6 max-w-md text-pretty text-lg leading-relaxed text-foreground/75">
              A two-minute daily check-in that remembers the people and patterns you can't see
              yourself — and reflects them back to you.
            </p>

            <div className="mt-9 max-w-md">
              {returning ? (
                <div className="flex flex-col items-start gap-3">
                  <Button onClick={() => navigate({ to: "/today" })} className="h-12 px-6 text-sm">
                    Continue as {user!.name}
                    <ArrowRight />
                  </Button>
                  <button
                    onClick={() => {
                      signOut();
                      setName("");
                      inputRef.current?.focus();
                    }}
                    className="press font-mono text-xs text-muted-foreground underline underline-offset-4 [@media(hover:hover)]:hover:text-foreground"
                  >
                    Not you? Start fresh
                  </button>
                </div>
              ) : (
                <>
                  <label htmlFor="your-name" className="label block">
                    Sign the first page
                  </label>
                  <div className="mt-2 flex items-end gap-3">
                    <input
                      id="your-name"
                      ref={inputRef}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && begin()}
                      placeholder="What should I call you?"
                      aria-label="Your name"
                      autoComplete="given-name"
                      className="prose-serif min-w-0 flex-1 border-0 border-b-2 border-foreground bg-transparent pb-1.5 text-2xl outline-none transition-[border-color] duration-150 placeholder:italic placeholder:text-foreground/35 focus:border-vermilion"
                    />
                    <Button onClick={begin} className="h-11 shrink-0 px-5 text-sm">
                      Begin
                      <ArrowRight />
                    </Button>
                  </div>
                  <p className="label mt-3">Private to this device. No account needed.</p>
                </>
              )}
            </div>
          </div>

          <div id="demo" className="animate-rise scroll-mt-6" style={{ animationDelay: "80ms" }}>
            <LiveDemo />
          </div>
        </section>

        {/* The three screens, as they really look. */}
        <section id="how" className="scroll-mt-6 border-t border-foreground/15 py-20">
          <div className="max-w-xl">
            <h2 className="label">How it works</h2>
            <p className="display mt-3 text-balance text-4xl sm:text-5xl">
              Write for two minutes. <span className="italic">Read yourself back</span> in a month.
            </p>
          </div>

          <div className="mt-14 grid gap-14 md:grid-cols-3 md:gap-8">
            {BEATS.map(({ n, title, body, src, alt }, i) => (
              <figure
                key={title}
                className={`animate-rise ${i === 1 ? "md:mt-12" : ""}`}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="frame">
                  <img src={src} alt={alt} width={780} height={1720} loading="lazy" decoding="async" />
                </div>
                <figcaption className="mt-5">
                  <span className="font-mono text-sm text-vermilion">{n}</span>
                  <h3 className="prose-serif mt-1 text-2xl leading-tight tracking-tight">{title}</h3>
                  <p className="mt-2 text-pretty text-[0.95rem] leading-relaxed text-foreground/70">
                    {body}
                  </p>
                </figcaption>
              </figure>
            ))}
          </div>

          <div className="mt-16 flex flex-col items-start gap-6 border-t border-foreground/15 pt-10 md:flex-row md:items-center md:justify-between">
            <p className="prose-serif max-w-lg text-pretty text-xl font-light italic leading-relaxed text-foreground/80">
              “Running shows up on almost every good day. Conversations with one person warmed up
              over time. Your hardest weeks all mention sleep.”
              <span className="label mt-2 block not-italic">the kind of thing it notices</span>
            </p>
            <Button
              onClick={returning ? () => navigate({ to: "/today" }) : focusStart}
              variant="secondary"
              className="h-11 px-6"
            >
              {returning ? "Open your journal" : "Start your throughline"}
            </Button>
          </div>
        </section>

        {/* For the people reading the code. */}
        <section id="built" className="scroll-mt-6 border-t border-foreground/15 py-16">
          <h2 className="label">Under the hood</h2>
          <dl className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2">
            {UNDER_THE_HOOD.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[5.5rem_1fr] gap-4 border-t border-foreground/15 pt-4">
                <dt className="font-mono text-xs text-vermilion">{k}</dt>
                <dd className="text-pretty text-[0.95rem] leading-relaxed text-foreground/75">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <footer className="border-t border-foreground/15 py-6 font-mono text-[11px] text-muted-foreground">
          Throughline is a journaling companion, not a mental-health tool.
        </footer>
      </div>
    </main>
  );
}
