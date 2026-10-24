import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  worker: {
    format: 'es',
  },
  server: {
    port: 3001,
  },
  build: {
    target: 'esnext',
    assetsInlineLimit: 0,
  },
});
