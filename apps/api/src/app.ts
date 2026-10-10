import {stockInvoicesRouter} from './routes/stockInvoices.js';
import { pickupRouter } from './routes/pickup.js';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { partnersRouter } from './routes/partners.js';
import { attributesRouter } from './routes/attributes.js';
import { brandsRouter } from './routes/brands.js';
import { productCatalogRouter } from './routes/productCatalog.js';
import { supportRouter } from './routes/support.js';
import { stockEntriesRouter } from './routes/stockEntries.js';
import { orderRemindersRouter } from './routes/orderReminders.js';
import { deviceReferenceRouter } from './routes/deviceReference.js';
import { stockRouter } from './routes/stock.js';
import { registryRouter } from './routes/registry.js';
import { peopleRouter } from './routes/people.js';
import { storeProfileRouter } from './routes/storeProfile.js';
import { storesRouter } from './routes/stores.js';
import { financeRouter } from './routes/finance.js';
import { posRouter } from './routes/pos.js';
import { profileRouter } from './routes/profile.js';
import { payoutSettingsRouter } from './routes/payoutSettings.js';
import { promotionsRouter } from './routes/promotions.js';
import { plansRouter } from './routes/plans.js';
import { moduleStateRouter } from './routes/moduleState.js';
import { totemRouter } from './routes/totem.js';
import { whatsappRouter } from './routes/whatsapp.js';
import { communicationRouter } from './routes/communication.js';
import { salesRouter } from './routes/sales.js';
import { commercialRouter } from './routes/commercial.js';
import { goalsRouter } from './routes/goals.js';
import { reportsRouter } from './routes/reports.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { notFoundHandler } from './middlewares/notFoundHandler.js';
import { proxyUnmatchedApi } from './middlewares/nestProxy.js';

import { companyUsersRouter } from './routes/companyUsers.js';
import { workOrdersRouter } from './routes/workOrders.js';

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
app.use(express.json({ limit: '5mb' }));

// Rotas da API da Marthi Plataforma
app.use(healthRouter);
app.use(authRouter);
app.use(partnersRouter);
app.use(attributesRouter);
app.use(pickupRouter);
app.use(brandsRouter);
app.use(productCatalogRouter);
app.use(supportRouter);
app.use(stockEntriesRouter);
app.use(orderRemindersRouter);
app.use(deviceReferenceRouter);
app.use(stockRouter);
app.use(stockInvoicesRouter);
app.use(registryRouter);
app.use(peopleRouter);
app.use(storeProfileRouter);
app.use(companyUsersRouter);
app.use(storesRouter);
app.use(financeRouter);
app.use(posRouter);
app.use(salesRouter);
app.use(commercialRouter);
app.use(goalsRouter);
app.use(reportsRouter);
app.use(profileRouter);
app.use(payoutSettingsRouter);
app.use(promotionsRouter);
app.use(plansRouter);
app.use(moduleStateRouter);
app.use(totemRouter);
app.use(whatsappRouter);
app.use(communicationRouter);
app.use(workOrdersRouter);

// Proxy residual para qualquer rota externa legada
app.use(proxyUnmatchedApi);

if (serveWeb && webDist) {
  app.use(express.static(webDist, { index: false, maxAge: '1h' }));
  app.get('*', (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }
    if (req.path.startsWith('/api') || req.path.startsWith('/health')) {
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

export { app };
