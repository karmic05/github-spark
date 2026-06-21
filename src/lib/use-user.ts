import { createContext, useCallback, useContext, useEffect, useState } from "react";

// The "user" for the hackathon is just a name the person gives on onboarding.
// We slugify it into a stable sub_tenant_id and persist it in the browser, so
// the same person always maps to the same HydraDB memory.

const KEY = "throughline.user";

export interface ThroughlineUser {
  id: string; // sub_tenant_id
  name: string; // display name
}

// The authenticated user is provided once by the _app layout (which only
// renders its children after the user is confirmed) and read by the app routes
// via useCurrentUser(). This avoids each route re-deriving the user with its
// own useUser() hook, whose state is null on first render (the bug that
// crashed <Today> with `user!.id`).
export const UserContext = createContext<ThroughlineUser | null>(null);

export function useCurrentUser(): ThroughlineUser {
  const user = useContext(UserContext);
  if (!user) {
    throw new Error("useCurrentUser must be used inside an authenticated route");
  }
  return user;
}

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "friend";
}

function read(): ThroughlineUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ThroughlineUser;
    if (parsed && typeof parsed.id === "string" && parsed.id) return parsed;
  } catch {
    // ignore
  }
  return null;
}

/**
 * Reads the persisted user. `ready` flips true only after mount so SSR and the
 * first client render agree (avoids a hydration flash before localStorage).
 */
export function useUser() {
  // Lazy initializer reads localStorage synchronously on the client, so a route
  // component's `user` is already populated on its first render (server returns
  // null — read() guards on `window`). Without this, each route's useUser was
  // null on first render and `user!.id` crashed <Today>/<Timeline>/<Insights>.
  const [user, setUser] = useState<ThroughlineUser | null>(() => read());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUser(read());
    setReady(true);
  }, []);

  const signIn = useCallback((name: string) => {
    const next: ThroughlineUser = { id: slugify(name), name: name.trim() };
    window.localStorage.setItem(KEY, JSON.stringify(next));
    setUser(next);
    return next;
  }, []);

  const signOut = useCallback(() => {
    window.localStorage.removeItem(KEY);
    setUser(null);
  }, []);

  return { user, ready, signIn, signOut };
}

export function todayISO(): string {
  // Local-date ISO (YYYY-MM-DD), not UTC, so "today" matches the writer's day.
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
}
