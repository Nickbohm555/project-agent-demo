import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolveProxyApiHost, resolveProxyApiPort, resolveWebHost, resolveWebPort } from "./config/ports";

const webPort = resolveWebPort();
const apiPort = resolveProxyApiPort();
const apiHost = resolveProxyApiHost();
const webHost = resolveWebHost();

export default defineConfig({
  plugins: [react()],
  server: {
    host: webHost,
    port: webPort,
    proxy: {
      "/api": {
        target: `http://${apiHost}:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
});
