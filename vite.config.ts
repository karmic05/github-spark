import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Plain Vite + TanStack Start. Nitro handles the server build: on Vercel
// (VERCEL=1) it emits the Build Output API (.vercel/output); everywhere else it
// uses Nitro's default Node server target.
export default defineConfig(({ command }) => ({
  server: { host: "::", port: 8080 },
  resolve: {
    dedupe: ["react", "react-dom", "@tanstack/react-query", "@tanstack/query-core"],
  },
  plugins: [
    tailwindcss(),
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      // Route the server entry through src/server.ts (our SSR error wrapper).
      server: { entry: "server" },
    }),
    ...(command === "build"
      ? [nitro(process.env.VERCEL ? { preset: "vercel" } : {})]
      : []),
    viteReact(),
  ],
}));
