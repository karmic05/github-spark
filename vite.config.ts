// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// On Lovable, the config auto-targets Cloudflare. Outside a Lovable build the
// Nitro deploy plugin is skipped — which would drop our server functions. When
// building on Vercel (VERCEL=1), force-enable Nitro with the Vercel preset so
// the build emits .vercel/output (Build Output API). Locally/Lovable this is a
// no-op, so their builds are unaffected.
const vercelNitro = process.env.VERCEL ? { nitro: { preset: "vercel" } } : {};

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  ...vercelNitro,
});
