/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build:single` produces one self-contained HTML file (fonts and images inlined)
// that runs offline. The normal `npm run build` emits a standard multi-file bundle.
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'singlefile' ? [viteSingleFile()] : [])],
  build: {
    outDir: mode === 'singlefile' ? 'dist-single' : 'dist',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}));
