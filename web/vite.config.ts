import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // type-only imports of the shared domain model
      "@core": fileURLToPath(new URL("../src/core", import.meta.url)),
    },
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:7424",
    },
  },
});
