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

      DO $$ BEGIN
        ALTER TABLE user_stores ALTER COLUMN role TYPE TEXT USING role::text;
        ALTER TABLE employees ALTER COLUMN role TYPE TEXT USING role::text;
        ALTER TABLE payables ALTER COLUMN account_id DROP NOT NULL;
        ALTER TABLE payables ADD COLUMN IF NOT EXISTS supplier_id TEXT;
        ALTER TABLE payables ADD COLUMN IF NOT EXISTS supplier_name TEXT DEFAULT '';
        ALTER TABLE payables ADD COLUMN IF NOT EXISTS document_number TEXT DEFAULT '';
        ALTER TABLE payables ALTER COLUMN created_at SET DEFAULT now();
        ALTER TABLE payables ALTER COLUMN updated_at SET DEFAULT now();

        ALTER TABLE receivables ALTER COLUMN account_id DROP NOT NULL;
        ALTER TABLE receivables ADD COLUMN IF NOT EXISTS customer_id TEXT;
        ALTER TABLE receivables ADD COLUMN IF NOT EXISTS customer_name TEXT DEFAULT '';
        ALTER TABLE receivables ADD COLUMN IF NOT EXISTS document_number TEXT DEFAULT '';
        ALTER TABLE receivables ALTER COLUMN created_at SET DEFAULT now();
        ALTER TABLE receivables ALTER COLUMN updated_at SET DEFAULT now();

        ALTER TABLE stores ALTER COLUMN email SET DEFAULT 'contato@marthi.com.br';
        ALTER TABLE stores ALTER COLUMN phone SET DEFAULT '(24) 99999-9999';

        ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS account_id TEXT;
        ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS operator_name TEXT DEFAULT '';
        ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Operacional';
        ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS ref_id TEXT;
        ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

        ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS plan_id TEXT NOT NULL DEFAULT 'golden';
        ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS modules JSONB NOT NULL DEFAULT '[]'::jsonb;
        ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS document_type TEXT NOT NULL DEFAULT 'cnpj';
        ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS document TEXT NOT NULL DEFAULT '';
        ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS legal_name TEXT NOT NULL DEFAULT '';
        ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS trade_name TEXT NOT NULL DEFAULT '';
        ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
        ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
        ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS zip_code TEXT NOT NULL DEFAULT '';
        ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS street TEXT NOT NULL DEFAULT '';
        ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS number TEXT NOT NULL DEFAULT '';
        ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS complement TEXT DEFAULT '';
        ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS district TEXT NOT NULL DEFAULT '';
        ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS city TEXT NOT NULL DEFAULT '';
        ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS state CHAR(2) NOT NULL DEFAULT '';
        ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS segment TEXT DEFAULT '';
        ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS contact_name TEXT NOT NULL DEFAULT '';
        ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS contact_role TEXT DEFAULT '';
        ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
        ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'aguardando_pagamento';
        ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS monthly_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
        ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'pix';
        ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS transaction_ref TEXT;
        ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ;
        ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS activation_token_sent_at TIMESTAMPTZ;
        ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS audit_trail JSONB NOT NULL DEFAULT '[]'::jsonb;
        ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
        ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

        ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
      EXCEPTION WHEN OTHERS THEN NULL; END $$;
    `);

    // 2. Limpeza rigorosa de registros temporários de testes e dados sintéticos
    try {
      await pool.query(`
        DELETE FROM partner_signups WHERE email LIKE '%@marthi.teste' OR email LIKE '%teste@%' OR company_name LIKE '%Alpha%' OR company_name LIKE '%Beta%' OR id LIKE 'PRT-MURC%';
        DELETE FROM auth_tokens WHERE email LIKE '%@marthi.teste' OR email LIKE 'admin.alpha%' OR email LIKE 'admin.beta%';
        DELETE FROM payables WHERE store_id NOT IN ('STR-DEMO-01');
        DELETE FROM receivables WHERE store_id NOT IN ('STR-DEMO-01');
        DELETE FROM product_attributes WHERE store_id NOT IN ('STR-DEMO-01');
        DELETE FROM products WHERE store_id NOT IN ('STR-DEMO-01');
        DELETE FROM stock_items WHERE store_id NOT IN ('STR-DEMO-01');
        DELETE FROM user_stores WHERE store_id NOT IN ('STR-DEMO-01') OR user_id IN (SELECT id FROM users WHERE email LIKE '%@marthi.teste' OR email LIKE 'admin.alpha%' OR email LIKE 'admin.beta%');
        DELETE FROM employees WHERE store_id NOT IN ('STR-DEMO-01') OR user_email LIKE '%@marthi.teste' OR user_email LIKE 'admin.alpha%' OR user_email LIKE 'admin.beta%';
        DELETE FROM stores WHERE id NOT IN ('STR-DEMO-01');
        DELETE FROM store_licenses WHERE client_account_id NOT IN ('ACC-MARTHI-DEMO');
        DELETE FROM users WHERE email LIKE '%@marthi.teste' OR email LIKE 'admin.alpha%' OR email LIKE 'admin.beta%';
        DELETE FROM client_accounts WHERE id NOT IN ('ACC-MARTHI-DEMO');
      `);
    } catch (cleanErr) {
      console.warn('[marthi-api] Aviso ao executar limpeza de dados de teste:', cleanErr);
    }

    // 3. Garante conta da Loja Demonstração Marthi com Plano Gold Ativo
    await pool.query(
      `INSERT INTO client_accounts (id, trade_name, legal_name, document_type, document, email, phone, contact_name, status, access_token)
       VALUES ('ACC-MARTHI-DEMO', 'Marthi Demonstração', 'Marthi Tecnologia e Demonstração LTDA', 'cnpj', '61.506.270/0001-63', 'contato@marthi.com.br', '(24) 98124-4253', 'Administrador Marthi', 'active', 'TK-001-000163-CPTR-88A1')
       ON CONFLICT (id) DO UPDATE SET
         trade_name = 'Marthi Demonstração',
         legal_name = 'Marthi Tecnologia e Demonstração LTDA',
         email = 'contato@marthi.com.br',
         access_token = 'TK-001-000163-CPTR-88A1',
         status = 'active'`,
    );

    // 4. Garante loja matriz Demonstração com Token de Acesso
    await pool.query(
      `INSERT INTO stores (
        id, client_account_id, trade_name, legal_name, document_type, document,
        state_registration, municipal_registration, email, phone, zip_code, street,
        number, complement, district, city, state, tax_regime, is_matrix, active, access_token
      ) VALUES (
        'STR-DEMO-01', 'ACC-MARTHI-DEMO', 'Loja Demonstração Marthi', 'Marthi Tecnologia e Demonstração LTDA',
        'cnpj', '61.506.270/0001-63', 'ISENTO', '12345', 'loja@marthi.com.br', '(24) 98124-4253',
        '25800-000', 'Rua Prefeito Walter Franklin', '120', 'Loja 01', 'Centro', 'Três Rios', 'RJ',
        'simples_nacional', true, true, 'TK-001-000163-CPTR-88A1'
      ) ON CONFLICT (id) DO UPDATE SET
        client_account_id = 'ACC-MARTHI-DEMO',
        trade_name = 'Loja Demonstração Marthi',
        legal_name = 'Marthi Tecnologia e Demonstração LTDA',
        document = '61.506.270/0001-63',
        email = 'loja@marthi.com.br',
        access_token = 'TK-001-000163-CPTR-88A1',
        active = true,
        is_matrix = true`,
    );

    // 5. Garante licença Gold ativa com todos os módulos para STR-DEMO-01
    try {
      await pool.query(
        `INSERT INTO store_licenses (id, store_id, client_account_id, plan_id, modules, status)
         VALUES ('LIC-DEMO-01', 'STR-DEMO-01', 'ACC-MARTHI-DEMO', 'scale', ARRAY['totem', 'os', 'erp', 'fiscal', 'ecommerce']::TEXT[], 'active')
         ON CONFLICT (id) DO UPDATE SET
           plan_id = 'scale',
           status = 'active',
           modules = ARRAY['totem', 'os', 'erp', 'fiscal', 'ecommerce']::TEXT[]`,
      );
    } catch (licErr) {
      console.warn('[marthi-api] Aviso ao sincronizar store_licenses:', licErr);
    }

    // 6. Garante usuário teste@marthi.com.br como Administrador
    const testEmail = 'teste@marthi.com.br';
    const testPass = '123';
    const salt = randomBytes(16).toString('hex');
    const pHash = hashPassword(testPass, salt);

    await pool.query(
      `INSERT INTO users (id, client_account_id, email, name, provider, password_hash, global_role, active)
       VALUES ('USR-TEST-ADMIN', 'ACC-MARTHI-DEMO', $1, 'Administrador Marthi', 'password', $2, 'admin', true)
       ON CONFLICT (email) DO UPDATE
       SET client_account_id = 'ACC-MARTHI-DEMO', global_role = 'admin', active = true, password_hash = $2`,
      [testEmail, `${salt}:${pHash}`],
    );

    // 7. Garante usuário marthi.tecnologia@gmail.com como Superadmin (para abertura do /admin)
    const marthiAdminEmail = 'marthi.tecnologia@gmail.com';
    const marthiSalt = randomBytes(16).toString('hex');
    const marthiHash = hashPassword('123', marthiSalt);

    await pool.query(
      `INSERT INTO users (id, client_account_id, email, name, provider, password_hash, global_role, active)
       VALUES ('usr-marthi-admin', 'ACC-MARTHI-DEMO', $1, 'Marthi Tecnologia', 'password', $2, 'superadmin', true)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = $2,
         name = 'Marthi Tecnologia',
         client_account_id = 'ACC-MARTHI-DEMO',
         active = true,
         global_role = 'superadmin'`,
      [marthiAdminEmail, `${marthiSalt}:${marthiHash}`],
    );

    // 8. Vínculo user_stores para AMBOS os administradores
    await pool.query(
      `DO $$ BEGIN
         ALTER TABLE user_stores ALTER COLUMN role TYPE TEXT USING role::text;
       EXCEPTION WHEN OTHERS THEN NULL; END $$;

       INSERT INTO user_stores (id, user_id, store_id, role, is_default, permissions)
       SELECT s.id, u.id, s.store_id, s.role, s.is_default, s.permissions
       FROM (
         VALUES
           ('UST-TEST-01', 'teste@marthi.com.br', 'STR-DEMO-01', 'admin', true, '{"all": true}'::jsonb),
           ('UST-MARTHI-01', 'marthi.tecnologia@gmail.com', 'STR-DEMO-01', 'admin', true, '{"all": true}'::jsonb)
       ) AS s(id, email, store_id, role, is_default, permissions)
       JOIN users u ON u.email = s.email
       ON CONFLICT (user_id, store_id) DO UPDATE SET role = EXCLUDED.role, is_default = true`,
    );

    // 9. Garante colaboradores teste e marthi na tabela employees com role admin e todas as áreas de acesso
    await pool.query(
      `INSERT INTO employees (id, store_id, name, phone, email, document, role, is_system_user, user_email, access_areas, active, created_at, updated_at)
       VALUES
         ('EMP-TESTE-ADMIN', 'STR-DEMO-01', 'Administrador Marthi', '(24) 98124-4253', 'teste@marthi.com.br', '', 'admin', true, 'teste@marthi.com.br', '["painel","totem","pdv","os","erp","fiscal","ecommerce"]'::jsonb, true, now(), now()),
         ('EMP-MARTHI-ADMIN', 'STR-DEMO-01', 'Marthi Tecnologia', '(24) 98124-4253', 'marthi.tecnologia@gmail.com', '', 'admin', true, 'marthi.tecnologia@gmail.com', '["painel","totem","pdv","os","erp","fiscal","ecommerce"]'::jsonb, true, now(), now())
       ON CONFLICT (id) DO UPDATE SET
         role = 'admin',
         is_system_user = true,
         access_areas = '["painel","totem","pdv","os","erp","fiscal","ecommerce"]'::jsonb,
         active = true,
         updated_at = now()`,
    );

    // 10. Garante produtos no catálogo do Totem e estoque da Loja Demonstração
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

    console.log('[marthi-api] ✓ Usuários, Tokens de Acesso, Lojas, Licenças e Catálogo sincronizados no banco de dados!');
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
