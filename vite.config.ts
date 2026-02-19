import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolveProxyApiPort, resolveWebHost, resolveWebPort } from "./config/ports";

const webPort = resolveWebPort();
const apiPort = resolveProxyApiPort();
const webHost = resolveWebHost();

export default defineConfig({
  plugins: [react()],
  server: {
    host: webHost,
    port: webPort,
    proxy: {
      "/api": {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
});
