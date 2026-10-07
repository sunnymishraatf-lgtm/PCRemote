import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Built output goes straight into the server's static dir so the PC
// needs no build step: just `npm install` (root) + `npm start`.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: '../server/public',
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8080',
      '/ws': { target: 'ws://127.0.0.1:8080', ws: true },
    },
  },
});
