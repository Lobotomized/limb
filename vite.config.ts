import { defineConfig } from 'vite';
import { editorSavePlugin } from './tools/vite-editor-plugin';

// Relative base so the same build loads from a web server and from Electron's file:// URL.
// The editor save endpoint exists only on the dev server (`npm run dev`).
export default defineConfig({
  base: './',
  build: { target: 'es2022', outDir: 'dist', chunkSizeWarningLimit: 4000 },
  server: { port: 5173 },
  plugins: [editorSavePlugin()],
});
