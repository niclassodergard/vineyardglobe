import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works from any URL path (e.g. /wine/).
  base: './',
  server: { host: true, port: 5173 },
  preview: { host: true, port: 8080 },
  build: { chunkSizeWarningLimit: 2000 },
});
