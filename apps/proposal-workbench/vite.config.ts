/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build:single` produces one self-contained HTML file (fonts and images inlined)
// that runs offline. The normal `npm run build` emits a standard multi-file bundle.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const proxyTarget = env.WORKBENCH_PROXY_TARGET || 'http://127.0.0.1:4281';
  return ({
  server: { proxy: { '/api': { target: proxyTarget, changeOrigin: true, configure: (proxy) => {
    proxy.on('proxyReq', (request, incoming) => {
      if (incoming.headers.origin === `http://${incoming.headers.host}`) request.setHeader('origin', new URL(proxyTarget).origin);
    });
  } } } },
  plugins: [react(), ...(mode === 'singlefile' ? [viteSingleFile()] : [])],
  build: {
    outDir: mode === 'singlefile' ? 'dist-single' : 'dist',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  });
});
