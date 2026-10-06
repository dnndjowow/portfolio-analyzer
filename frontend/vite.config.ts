import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("commonjsHelpers")) return "react-vendor";
          if (!id.includes("node_modules")) return;
          if (/\/(react|react-dom|scheduler|clsx)\//.test(id)) return "react-vendor";
          if (/\/(recharts|recharts-scale|react-smooth|d3-[^/]+|lodash|decimal.js-light|victory-vendor)\//.test(id)) return "charts";
        },
      },
    },
  },
  server: { port: 5173, proxy: { "/api": process.env.VITE_PROXY ?? "http://localhost:8000" } },
});
