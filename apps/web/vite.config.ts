import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const rootEnvDir = resolve(__dirname, '../..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootEnvDir, '');
  const nestTarget = (env.VITE_API_URL || 'https://marthi-backend.discloud.app').replace(
    /\/$/,
    '',
  );

  return {
    // Lê .env da raiz do monorepo e de apps/web
    envDir: rootEnvDir,
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      // Dev: mesma origem → sem CORS. Produção build usa VITE_API_URL direto.
      proxy: {
        '/health': { target: nestTarget, changeOrigin: true, secure: true },
        '/api': { target: nestTarget, changeOrigin: true, secure: true },
      },
    },
  };
});
