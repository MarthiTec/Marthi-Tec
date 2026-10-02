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
import { communicationRouter } from './routes/communication.js';
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
app.use(communicationRouter);

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

    // Garante que teste@marthi.com.br e marthi.tecnologia@gmail.com existam no banco com senha 123 e permissão admin
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

    const marthiAdminEmail = 'marthi.tecnologia@gmail.com';
    const marthiSalt = randomBytes(16).toString('hex');
    const marthiHash = hashPassword('123', marthiSalt);

    await pool.query(
      `INSERT INTO users (id, client_account_id, email, name, provider, password_hash, global_role, active)
       VALUES ('usr-marthi-admin', 'ACC-MARTHI-DEMO', $1, 'Marthi Tecnologia', 'password', $2, 'admin', true)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = $2,
         name = 'Marthi Tecnologia',
         client_account_id = 'ACC-MARTHI-DEMO',
         active = true,
         global_role = 'admin'`,
      [marthiAdminEmail, `${marthiSalt}:${marthiHash}`],
    );

    // Garante conta Cell Ponto com CNPJ e Token de Acesso
    await pool.query(
      `INSERT INTO client_accounts (id, trade_name, legal_name, document_type, document, email, phone, contact_name, status, access_token)
       VALUES ('ACC-MARTHI-DEMO', 'Cell Ponto', 'Cell Ponto Telecomunicações LTDA', 'cnpj', '61.506.270/0001-63', 'contato@cellponto.com.br', '(24) 98124-4253', 'Administrador', 'active', 'TK-001-000163-CPTR-88A1')
       ON CONFLICT (document) DO UPDATE SET
         trade_name = 'Cell Ponto',
         email = 'contato@cellponto.com.br',
         access_token = 'TK-001-000163-CPTR-88A1',
         status = 'active'`,
    );

    // Garante loja matriz Cell Ponto com Token de Acesso
    await pool.query(
      `INSERT INTO stores (
        id, client_account_id, trade_name, legal_name, document_type, document,
        state_registration, municipal_registration, email, phone, zip_code, street,
        number, complement, district, city, state, tax_regime, is_matrix, active, access_token
      ) VALUES (
        'STR-DEMO-01', 'ACC-MARTHI-DEMO', 'Cell Ponto Matriz', 'Cell Ponto Telecomunicações LTDA',
        'cnpj', '61.506.270/0001-63', 'ISENTO', '12345', 'matriz@cellponto.com.br', '(24) 98124-4253',
        '25800-000', 'Rua Prefeito Walter Franklin', '120', 'Loja 01', 'Centro', 'Três Rios', 'RJ',
        'simples_nacional', true, true, 'TK-001-000163-CPTR-88A1'
      ) ON CONFLICT (id) DO UPDATE SET
        client_account_id = 'ACC-MARTHI-DEMO',
        trade_name = 'Cell Ponto Matriz',
        legal_name = 'Cell Ponto Telecomunicações LTDA',
        document = '61.506.270/0001-63',
        email = 'matriz@cellponto.com.br',
        access_token = 'TK-001-000163-CPTR-88A1',
        active = true,
        is_matrix = true`,
    );

    // Vínculo user_stores para marthi admin
    await pool.query(
      `INSERT INTO user_stores (id, user_id, store_id, role, is_default, permissions)
       VALUES ('UST-MARTHI-01', 'usr-marthi-admin', 'STR-DEMO-01', 'admin', true, '{"all": true}'::jsonb)
       ON CONFLICT (user_id, store_id) DO UPDATE SET role = 'admin'`,
    );

    // Garante colaborador Marthi Tecnologia na tabela employees com role admin e todas as áreas de acesso
    await pool.query(
      `INSERT INTO employees (id, store_id, name, phone, email, document, role, is_system_user, user_email, access_areas, active)
       VALUES ('EMP-MARTHI-ADMIN', 'STR-DEMO-01', 'Marthi Tecnologia', '', 'marthi.tecnologia@gmail.com', '', 'admin', true, 'marthi.tecnologia@gmail.com', '["painel","totem","pdv","os","erp","fiscal","ecommerce"]'::jsonb, true)
       ON CONFLICT (id) DO UPDATE SET
         name = 'Marthi Tecnologia',
         user_email = 'marthi.tecnologia@gmail.com',
         role = 'admin',
         is_system_user = true,
         access_areas = '["painel","totem","pdv","os","erp","fiscal","ecommerce"]'::jsonb,
         active = true`,
    );

    console.log('[marthi-api] ✓ Usuários, Tokens de Acesso, Lojas e Permissões sincronizados no banco de dados!');
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
