import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// base "./" keeps every asset path relative, so the build works from
// https://<user>.github.io/<repo>/ without knowing the repo name
export default defineConfig({
  base: "./",
  plugins: [react()],
  // in development, /api goes to the AI backend if it is running;
  // the app falls back to its own offline logic when it is not
  server: { proxy: { "/api": { target: "http://localhost:8787", changeOrigin: true } } },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"]
  }
});
