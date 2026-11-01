import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { BottomNav } from "@/components/bottom-nav";
import { LogoMark } from "@/components/logo";
import { useUser } from "@/lib/use-user";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const navigate = useNavigate();
  const { user, ready } = useUser();

  // Guard: no name yet → back to onboarding.
  useEffect(() => {
    if (ready && !user) navigate({ to: "/" });
  }, [ready, user, navigate]);

  if (!ready || !user) {
    return <div className="min-h-screen" />;
  }

  return (
    <div className="mx-auto min-h-screen max-w-xl pb-28">
      <header className="flex items-center justify-between px-5 pt-5">
        <Link to="/" className="press flex items-center gap-2 text-foreground" aria-label="Throughline home">
          <LogoMark className="h-5 w-5 text-vermilion" />
          <span className="prose-serif text-lg tracking-tight">Throughline</span>
        </Link>
        <span className="eyebrow max-w-[50%] truncate">{user.name}</span>
      </header>
      <div className="mx-5 mt-4 border-t border-foreground/15" />
      <Outlet />
      <BottomNav />
    </div>
  );
}
