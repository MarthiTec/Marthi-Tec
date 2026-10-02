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
import { hashPassword, verifySessionToken } from './services/authService.js';
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

// Rota administrativa para acionar migrações sob demanda
app.post('/api/v1/admin/migrate', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }
    const token = authHeader.slice(7);
    const user = await verifySessionToken(token);
    if (user.role !== 'admin') {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }
    const applied = await bootstrapDatabase();
    res.json({ success: true, message: 'Migrations e dados de inicialização aplicados com sucesso!', applied });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

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
 * Inicializa banco, executa migrations com retry e garante integridade das contas e usuários
 */
async function bootstrapDatabase() {
  if (!pool) {
    console.log('[marthi-api] Pool de banco não ativo (variáveis não informadas). Operando em memória.');
    return [];
  }

  // Tenta conectar com retentativas (até 10 tentativas com intervalo de 3s para aguardar DNS/VLAN da Discloud)
  let connected = false;
  for (let attempt = 1; attempt <= 10; attempt++) {
    const check = await checkDatabaseConnection();
    if (check.connected) {
      connected = true;
      break;
    }
    console.warn(`[marthi-api] Aguardando conexão PostgreSQL (tentativa ${attempt}/10): ${check.error || 'indisponível'}`);
    await new Promise((r) => setTimeout(r, 3000));
  }

  if (!connected) {
    console.error('[marthi-api] Falha ao conectar ao PostgreSQL após 10 tentativas. Operando em modo de resiliência.');
    return [];
  }

  try {
    // Saneamento preventivo para garantir compatibilidade caso existam tabelas legadas sem client_account_id
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS client_accounts (
          id TEXT PRIMARY KEY,
          trade_name TEXT NOT NULL,
          legal_name TEXT NOT NULL,
          document_type TEXT NOT NULL DEFAULT 'cnpj',
          document TEXT NOT NULL UNIQUE,
          email TEXT NOT NULL DEFAULT '',
          phone TEXT NOT NULL DEFAULT '',
          contact_name TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'active',
          access_token TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        ALTER TABLE client_accounts ADD COLUMN IF NOT EXISTS access_token TEXT;
        ALTER TABLE stores ADD COLUMN IF NOT EXISTS client_account_id TEXT;
        ALTER TABLE stores ADD COLUMN IF NOT EXISTS access_token TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS client_account_id TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS global_role TEXT DEFAULT 'operator';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;
      `);
    } catch (preErr) {
      console.warn('[marthi-api] Aviso no pre-saneamento DDL:', preErr);
    }

    console.log('[marthi-api] PostgreSQL conectado! Executando migrations...');
    const applied = await runMigrations();

    // 1. Garante que as colunas essenciais na tabela stock_items existam no PostgreSQL
    await pool.query(`
      ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'UN';
      ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Geral';
      ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS brand TEXT NOT NULL DEFAULT '';
      ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
      ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS attrs JSONB NOT NULL DEFAULT '{}'::jsonb;
      ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '';
      ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS capacity TEXT NOT NULL DEFAULT '';
      ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS card_rate NUMERIC(6,2) NOT NULL DEFAULT 0;
      ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS show_on_totem BOOLEAN NOT NULL DEFAULT true;
      ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb;
      ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
      ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
    `);

    // 2. Garante que teste@marthi.com.br e marthi.tecnologia@gmail.com existam no banco com senha 123 e permissão admin
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

    // Garante Gilvan Teodoro no banco com senha Marthi123 e role admin
    const gilvanEmail = 'gilvanteodo@gmail.com';
    const gilvanSalt = 'c1d2e3f4a5b6';
    const gilvanHash = hashPassword('Marthi123', gilvanSalt);
    await pool.query(
      `INSERT INTO users (id, client_account_id, email, name, provider, password_hash, global_role, active)
       VALUES ('usr-gilvan-cellponto', 'ACC-MARTHI-DEMO', $1, 'Gilvan Teodoro', 'password', $2, 'admin', true)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = $2,
         name = 'Gilvan Teodoro',
         client_account_id = 'ACC-MARTHI-DEMO',
         active = true,
         global_role = 'admin'`,
      [gilvanEmail, `${gilvanSalt}:${gilvanHash}`],
    );

    // Garante Mariana Veiga no banco com senha 1234 e role admin
    const marianaEmail = 'marianaveigatav@gmail.com';
    const marianaSalt = 'f7e8d9c0b1a2';
    const marianaHash = hashPassword('1234', marianaSalt);
    await pool.query(
      `INSERT INTO users (id, client_account_id, email, name, provider, password_hash, global_role, active)
       VALUES ('usr-mariana-cellponto', 'ACC-MARTHI-DEMO', $1, 'Mariana Veiga', 'password', $2, 'admin', true)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = $2,
         name = 'Mariana Veiga',
         client_account_id = 'ACC-MARTHI-DEMO',
         active = true,
         global_role = 'admin'`,
      [marianaEmail, `${marianaSalt}:${marianaHash}`],
    );

    // 3. Garante conta Cell Ponto com CNPJ e Token de Acesso
    await pool.query(
      `INSERT INTO client_accounts (id, trade_name, legal_name, document_type, document, email, phone, contact_name, status, access_token)
       VALUES ('ACC-MARTHI-DEMO', 'Cell Ponto', 'Cell Ponto Telecomunicações LTDA', 'cnpj', '61.506.270/0001-63', 'contato@cellponto.com.br', '(24) 98124-4253', 'Administrador', 'active', 'TK-001-000163-CPTR-88A1')
       ON CONFLICT (id) DO UPDATE SET
         trade_name = 'Cell Ponto',
         email = 'contato@cellponto.com.br',
         access_token = 'TK-001-000163-CPTR-88A1',
         status = 'active'`,
    );

    // 4. Garante loja matriz Cell Ponto com Token de Acesso
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

    // 5. Vínculo user_stores para todos os administradores
    try {
      await pool.query(
        `INSERT INTO user_stores (id, user_id, store_id, role, is_default, permissions)
         VALUES
           ('UST-TEST-01', 'USR-TEST-ADMIN', 'STR-DEMO-01', 'admin', true, '{"all": true}'::jsonb),
           ('UST-MARTHI-01', 'usr-marthi-admin', 'STR-DEMO-01', 'admin', true, '{"all": true}'::jsonb),
           ('UST-GILVAN-01', 'usr-gilvan-cellponto', 'STR-DEMO-01', 'admin', true, '{"all": true}'::jsonb),
           ('UST-MARIANA-01', 'usr-mariana-cellponto', 'STR-DEMO-01', 'admin', true, '{"all": true}'::jsonb)
         ON CONFLICT (user_id, store_id) DO UPDATE SET role = 'admin', is_default = true`,
      );
    } catch (ustErr) {
      console.warn('[marthi-api] Aviso ao vincular user_stores:', ustErr);
    }

    // 6. Garante colaboradores teste, marthi, gilvan e mariana na tabela employees com role admin e todas as áreas de acesso
    try {
      await pool.query(
        `INSERT INTO employees (id, store_id, name, phone, email, document, role, is_system_user, user_email, access_areas, active)
         VALUES
           ('EMP-TESTE-ADMIN', 'STR-DEMO-01', 'Marthi Teste Admin', '(24) 98124-4253', 'teste@marthi.com.br', '', 'admin', true, 'teste@marthi.com.br', '["painel","totem","pdv","os","erp","fiscal","ecommerce"]'::jsonb, true),
           ('EMP-MARTHI-ADMIN', 'STR-DEMO-01', 'Marthi Tecnologia', '(24) 98124-4253', 'marthi.tecnologia@gmail.com', '', 'admin', true, 'marthi.tecnologia@gmail.com', '["painel","totem","pdv","os","erp","fiscal","ecommerce"]'::jsonb, true),
           ('EMP-GILVAN-ADMIN', 'STR-DEMO-01', 'Gilvan Teodoro', '(24) 98124-4253', 'gilvanteodo@gmail.com', '', 'admin', true, 'gilvanteodo@gmail.com', '["painel","totem","pdv","os","erp","fiscal","ecommerce"]'::jsonb, true),
           ('EMP-MARIANA-ADMIN', 'STR-DEMO-01', 'Mariana Veiga', '', 'marianaveigatav@gmail.com', '', 'admin', true, 'marianaveigatav@gmail.com', '["painel","totem","pdv","os","erp","fiscal","ecommerce"]'::jsonb, true)
         ON CONFLICT (id) DO UPDATE SET
           role = 'admin',
           is_system_user = true,
           access_areas = '["painel","totem","pdv","os","erp","fiscal","ecommerce"]'::jsonb,
           active = true`,
      );
    } catch (empErr) {
      console.warn('[marthi-api] Aviso ao sincronizar employees:', empErr);
    }

    // 7. Garante licença ativa com todos os módulos para STR-DEMO-01
    try {
      await pool.query(
        `INSERT INTO store_licenses (id, store_id, client_account_id, plan_id, modules, status)
         VALUES ('LIC-DEMO-01', 'STR-DEMO-01', 'ACC-MARTHI-DEMO', 'scale', ARRAY['totem', 'os', 'erp', 'fiscal', 'ecommerce']::module_id[], 'active')
         ON CONFLICT (store_id) DO UPDATE SET
           plan_id = 'scale',
           status = 'active',
           modules = ARRAY['totem', 'os', 'erp', 'fiscal', 'ecommerce']::module_id[]`,
      );
    } catch (licErr) {
      console.warn('[marthi-api] Aviso ao sincronizar store_licenses:', licErr);
    }

    // 8. Garante produtos no catálogo do Totem e estoque Cell Ponto se não houver nenhum
    const stockCountRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM stock_items WHERE store_id = 'STR-DEMO-01' AND (show_on_totem = true OR show_on_totem IS NULL)`,
    );
    if ((stockCountRes.rows[0]?.total || 0) === 0) {
      await pool.query(`
        INSERT INTO stock_items (
          id, store_id, name, sku, barcode, imei, unit, qty, min_qty, cost, price,
          kind, condition, category, brand, active, attrs, color, capacity, card_rate, show_on_totem, images
        )
        SELECT
          p.id, 'STR-DEMO-01', p.name, p.sku, p.barcode, '', 'UN', p.qty, 1, p.cost, p.price,
          p.kind::stock_kind, 'new'::stock_condition, p.category, p.brand, true,
          p.attrs::jsonb, p.color, p.capacity, 12.0, true, p.images::jsonb
        FROM (
          VALUES
            ('STK-IPHONE15-128', 'iPhone 15 128GB Preto', 'APL-15-128-BLK', '789123456001', 5, 3800.00, 4799.00, 'device', 'Smartphones', 'Apple', '{"Cor": "Preto", "Capacidade": "128 GB"}', 'Preto', '128 GB', '["https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=600&auto=format&fit=crop&q=80"]'),
            ('STK-IPHONE16P-128', 'iPhone 16 Pro 128GB Titânio', 'APL-16P-128-TIT', '789123456002', 3, 6500.00, 7999.00, 'device', 'Smartphones', 'Apple', '{"Cor": "Titânio Natural", "Capacidade": "128 GB"}', 'Titânio Natural', '128 GB', '["https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=600&auto=format&fit=crop&q=80"]'),
            ('STK-REDMI-NOTE13', 'Xiaomi Redmi Note 13 256GB Azul', 'XIA-RN13-256-BLU', '789123456003', 8, 1050.00, 1499.00, 'device', 'Smartphones', 'Xiaomi', '{"Cor": "Azul", "Capacidade": "256 GB"}', 'Azul', '256 GB', '["https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=600&auto=format&fit=crop&q=80"]'),
            ('STK-PELICULA-3D', 'Película de Vidro 3D Privacidade', 'ACC-PEL-3D-PRIV', '789123456004', 30, 8.00, 49.90, 'part', 'Acessórios', 'Premium', '{}', '', '', '["https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=600&auto=format&fit=crop&q=80"]'),
            ('STK-CABO-USBC', 'Cabo USB-C Turbo 20W Reforçado', 'ACC-CAB-USBC-20W', '789123456005', 25, 15.00, 79.90, 'part', 'Acessórios', 'Geonav', '{}', '', '', '["https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=600&auto=format&fit=crop&q=80"]'),
            ('STK-CARREGADOR-25W', 'Carregador Rápido 25W Homologado Anatel', 'ACC-CAR-25W-FAST', '789123456006', 15, 28.00, 129.90, 'part', 'Acessórios', 'Anker', '{}', '', '', '["https://images.unsplash.com/photo-1585338107529-13afc5f02586?w=600&auto=format&fit=crop&q=80"]')
        ) AS p(id, name, sku, barcode, qty, cost, price, kind, category, brand, attrs, color, capacity, images)
        ON CONFLICT (id) DO UPDATE SET show_on_totem = true, active = true;
      `);
      console.log('[marthi-api] ✓ Catálogo inicial de produtos para o Totem inserido com sucesso!');
    }

    // 9. Limpeza definitiva de contas legadas de teste/mock
    await pool.query(`
      DELETE FROM user_stores WHERE user_id IN ('usr-mariana-cellponto', 'usr-gilvan-cellponto');
      DELETE FROM employees WHERE user_email IN ('marianaveigatav@gmail.com', 'gilvanteodo@gmail.com', 'gilvancellponto@gmail.com');
      DELETE FROM users WHERE email IN ('marianaveigatav@gmail.com', 'gilvanteodo@gmail.com', 'gilvancellponto@gmail.com');
    `);

    console.log('[marthi-api] ✓ Usuários, Tokens de Acesso, Lojas, Licenças e Catálogo sincronizados no banco de dados!');
    return applied;
  } catch (err) {
    console.error('[marthi-api] Erro ao inicializar banco de dados:', err);
    return [];
  }
}

app.listen(env.PORT, '0.0.0.0', () => {
  console.log(
    `[marthi-api] listening on 0.0.0.0:${env.PORT} (${env.APP_ENV})${serveWeb ? ` · web:${webDist}` : ' · WEB AUSENTE'}`,
  );
  void bootstrapDatabase();
});
