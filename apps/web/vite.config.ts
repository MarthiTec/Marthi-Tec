import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const rootEnvDir = resolve(__dirname, '../..');
/** Mesma árvore do MAIN na Discloud: /home/node/dist/public */
const outDir = resolve(__dirname, '../../dist/public');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootEnvDir, '');
  const nestTarget = (env.VITE_API_URL || 'https://marthi-backend.discloud.app').replace(
    /\/$/,
    '',
  );

  return {
    envDir: rootEnvDir,
    plugins: [react()],
    build: {
      outDir,
      emptyOutDir: true,
      assetsDir: 'assets',
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      proxy: {
        '/health': { target: nestTarget, changeOrigin: true, secure: true },
        '/api': { target: nestTarget, changeOrigin: true, secure: true },
      },
    },
  };
});
