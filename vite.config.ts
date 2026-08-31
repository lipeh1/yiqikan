import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
  },
  server: {
    port: 9999,
    proxy: {
      '/ws': { target: 'ws://localhost:10000', ws: true },
    },
  },
});
