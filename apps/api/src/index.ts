import path from 'node:path';
import fs from 'node:fs';
import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import { healthRouter } from './routes/health.js';
import { productsRouter } from './routes/products.js';
import { authRouter } from './routes/auth.js';
import { totemRouter } from './routes/totem.js';
import { partnersRouter } from './routes/partners.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { notFoundHandler } from './middlewares/notFoundHandler.js';

const app = express();
const webDist = path.resolve(process.cwd(), 'apps/web/dist');
const serveWeb = fs.existsSync(path.join(webDist, 'index.html'));

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.use(healthRouter);
app.use(authRouter);
app.use(totemRouter);
app.use(productsRouter);
app.use(partnersRouter);

if (serveWeb) {
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
      },
    });
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.PORT, '0.0.0.0', () => {
  console.log(
    `[marthi-api] listening on 0.0.0.0:${env.PORT} (${env.APP_ENV})${serveWeb ? ' · web' : ''}`,
  );
});
