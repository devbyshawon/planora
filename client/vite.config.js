import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pwaBuild from "./pwa-build.js";
export default defineConfig({
  plugins: [react(), pwaBuild()],
  build: { rollupOptions: { input: { main: "index.html", offline: "offline-planner.html" } } },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": { target: "http://127.0.0.1:5001", changeOrigin: false } },
  },
});
