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
import { stockRouter } from './routes/stock.js';
import { registryRouter } from './routes/registry.js';
import { storesRouter } from './routes/stores.js';
import { financeRouter } from './routes/finance.js';
import { posRouter } from './routes/pos.js';
import { profileRouter } from './routes/profile.js';
import { totemRouter } from './routes/totem.js';
import { whatsappRouter } from './routes/whatsapp.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { notFoundHandler } from './middlewares/notFoundHandler.js';
import { proxyUnmatchedApi } from './middlewares/nestProxy.js';
import { pool, checkDatabaseConnection } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { hashPassword } from './services/authService.js';
import { randomBytes } from 'node:crypto';

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
app.use(stockRouter);
app.use(registryRouter);
app.use(storesRouter);
app.use(financeRouter);
app.use(posRouter);
app.use(profileRouter);
app.use(totemRouter);
app.use(whatsappRouter);

// Proxy residual para qualquer rota externa legada
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

/**
 * Inicializa banco, executa migrations e garante integridade do usuário teste@marthi.com.br
 */
async function bootstrapDatabase() {
  if (!pool) {
    console.log('[marthi-api] Pool de banco não ativo (variáveis não informadas). Operando em memória.');
    return;
  }

  try {
    const check = await checkDatabaseConnection();
    if (!check.connected) {
      console.warn('[marthi-api] Falha inicial ao conectar ao PostgreSQL:', check.error);
      return;
    }

    console.log('[marthi-api] PostgreSQL conectado! Executando migrations...');
    await runMigrations();

    // Garante que teste@marthi.com.br exista no banco com senha 123 e permissão admin
    const testEmail = 'teste@marthi.com.br';
    const testPass = '123';
    const salt = randomBytes(16).toString('hex');
    const pHash = hashPassword(testPass, salt);

    await pool.query(
      `INSERT INTO users (id, client_account_id, email, name, provider, password_hash, global_role, active)
       VALUES ('USR-TEST-ADMIN', 'ACC-MARTHI-DEMO', $1, 'Marthi Teste Admin', 'password', $2, 'admin', true)
       ON CONFLICT (email) DO UPDATE
       SET global_role = 'admin', active = true, password_hash = $2`,
      [testEmail, `${salt}:${pHash}`],
    );

    // Garante associação da loja default
    await pool.query(
      `INSERT INTO user_stores (id, user_id, store_id, role, is_default, permissions)
       VALUES ('UST-TEST-01', 'USR-TEST-ADMIN', 'STR-DEMO-01', 'admin', true, '{"all": true}'::jsonb)
       ON CONFLICT (user_id, store_id) DO UPDATE SET role = 'admin'`,
    );

    console.log('[marthi-api] ✓ Usuário teste@marthi.com.br sincronizado com perfil Administrador e credenciais ativas!');
  } catch (err) {
    console.error('[marthi-api] Erro ao inicializar banco de dados:', err);
  }
}

app.listen(env.PORT, '0.0.0.0', () => {
  console.log(
    `[marthi-api] listening on 0.0.0.0:${env.PORT} (${env.APP_ENV})${serveWeb ? ` · web:${webDist}` : ' · WEB AUSENTE'}`,
  );
  void bootstrapDatabase();
});
