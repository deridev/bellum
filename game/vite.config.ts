import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  base: './',
  build: {
    target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 4000, modulePreload: false,
    // one classic script (no module loading) so the build runs anywhere, including sandboxed hosts
    rollupOptions: { output: { format: 'iife', inlineDynamicImports: true, entryFileNames: 'assets/bellum.js', assetFileNames: 'assets/[name][extname]' } },
  },
});
