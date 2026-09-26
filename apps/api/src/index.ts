import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import { healthRouter } from './routes/health.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { notFoundHandler } from './middlewares/notFoundHandler.js';
import { proxyUnmatchedApi } from './middlewares/nestProxy.js';

const app = express();

/** /home/node/dist → /home/node */
const apiDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(apiDir, '..');

function resolveWebDist() {
  const candidates = [
    // Preferido na Discloud (sai junto do build da API)
    path.join(apiDir, 'public'),
    path.join(projectRoot, 'dist/public'),
    // Fallback local / legado
    path.join(projectRoot, 'apps/web/dist'),
    path.join(process.cwd(), 'dist/public'),
    path.join(process.cwd(), 'apps/web/dist'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'index.html'))) return dir;
  }
  return null;
}

const webDist = resolveWebDist();
const serveWeb = Boolean(webDist);

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.use(healthRouter);
// Perfil, totem, estoque, PDV e auth ficam no Nest. Este processo só publica o site.
app.use(proxyUnmatchedApi);

if (serveWeb && webDist) {
  app.use(express.static(webDist, { index: false, maxAge: '1h' }));
  app.get('*', (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }
    if (req.path.startsWith('/api') || req.path === '/health') {
      next();
      return;
    }
    res.sendFile(path.join(webDist, 'index.html'), (error) => {
      if (error) next(error);
    });
  });
} else {
  app.get('/', (_req, res) => {
    res.json({
      success: true,
      data: {
        service: env.APP_NAME,
        message: 'Marthi API (web build ausente)',
        docs: '/health',
        lookedIn: [
          path.join(apiDir, 'public'),
          path.join(projectRoot, 'dist/public'),
          path.join(projectRoot, 'apps/web/dist'),
        ],
        cwd: process.cwd(),
        projectRoot,
        apiDir,
      },
    });
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.PORT, '0.0.0.0', () => {
  console.log(
    `[marthi-api] listening on 0.0.0.0:${env.PORT} (${env.APP_ENV})${serveWeb ? ` · web:${webDist}` : ' · WEB AUSENTE'}`,
  );
});
