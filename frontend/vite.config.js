import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const hasApiUrl = Boolean((env.VITE_API_URL || "").trim());

  return {
    plugins: [react()],
    server: {
      port: 5173,
      // When VITE_API_URL is set, frontend calls that URL directly.
      proxy: hasApiUrl
        ? undefined
        : {
            "/repos": {
              target: "http://localhost:8000",
              changeOrigin: true,
            },
            "/health": {
              target: "http://localhost:8000",
              changeOrigin: true,
            },
          },
    },
  };
});
