import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Durante "npm run dev" local, as chamadas a /api/* precisam de "vercel dev"
      // rodando (ele já serve tanto o front quanto as functions). Este proxy é só
      // um fallback caso você rode vite dev puro e tenha o `vercel dev` na porta 3000.
      "/api": "http://localhost:3000",
    },
  },
});
