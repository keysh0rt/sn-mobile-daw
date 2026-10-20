import { defineConfig } from "vite";
export default defineConfig({
  base: "/sn-mobile-daw/",
  worker: { format: "es" },
  build: { target: "es2022", assetsInlineLimit: 0 }
});