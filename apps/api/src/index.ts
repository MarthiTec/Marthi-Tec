import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import { healthRouter } from './routes/health.js';
import { productsRouter } from './routes/products.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { notFoundHandler } from './middlewares/notFoundHandler.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/', (_req, res) => {
  res.json({
    success: true,
    data: {
      service: env.APP_NAME,
      message: 'Marthi API',
      docs: '/health',
    },
  });
});

app.use(healthRouter);
app.use(productsRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.PORT, '0.0.0.0', () => {
  console.log(`[marthi-api] listening on 0.0.0.0:${env.PORT} (${env.APP_ENV})`);
});
