import { defineConfig } from 'vite';

// Relative base so the same build loads from a web server and from Electron's file:// URL.
export default defineConfig({
  base: './',
  build: { target: 'es2022', outDir: 'dist', chunkSizeWarningLimit: 4000 },
  server: { port: 5173 },
});
