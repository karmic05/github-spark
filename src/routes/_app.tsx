import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { BottomNav } from "@/components/bottom-nav";
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
    <div className="mx-auto min-h-screen max-w-md pb-24">
      <Outlet />
      <BottomNav />
    </div>
  );
}
