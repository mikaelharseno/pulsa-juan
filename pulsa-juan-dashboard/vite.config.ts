import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // hoisted deps (react-router, MUI) must not pull the root's React 19 — one React copy only
    dedupe: ['react', 'react-dom'],
    alias: {
      // consume the shared package from source so no build step is needed in dev
      'pulsa-juan-common': path.resolve(__dirname, '../pulsa-juan-common/src/index.ts'),
    },
  },
  server: { port: 3031, strictPort: true },
});
