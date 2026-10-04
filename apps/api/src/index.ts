import { app } from './app.js';
import { env } from './config/env.js';
import { pool, checkDatabaseConnection } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { hashPassword } from './services/authService.js';
import { randomBytes } from 'node:crypto';

/**
 * Inicializa banco, executa migrations e garante integridade dos dados essenciais
 */
async function bootstrapDatabase() {
  if (!pool) {
    console.log('[marthi-api] Pool de banco não ativo. Operando em contingência em memória.');
    return;
  }

  try {
    const check = await checkDatabaseConnection();
    if (!check.connected) {
      console.warn('[marthi-api] Falha inicial ao conectar ao PostgreSQL:', check.error);
      return;
    }

    console.log('[marthi-api] PostgreSQL conectado! Executando migrations...');
    try {
      await runMigrations();
    } catch (migErr) {
      console.warn('[marthi-api] Aviso ao executar migrations:', migErr);
    }

    // 1. Garante colunas essenciais e tabelas complementares no PostgreSQL
    try {
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
          ALTER TABLE stores ALTER COLUMN zip_code SET DEFAULT '';
          ALTER TABLE stores ALTER COLUMN street SET DEFAULT '';
          ALTER TABLE stores ALTER COLUMN number SET DEFAULT '';
          ALTER TABLE stores ALTER COLUMN complement SET DEFAULT '';
          ALTER TABLE stores ALTER COLUMN district SET DEFAULT '';
          ALTER TABLE stores ALTER COLUMN city SET DEFAULT '';
          ALTER TABLE stores ALTER COLUMN state SET DEFAULT 'RJ';
          ALTER TABLE stores ALTER COLUMN tax_regime SET DEFAULT 'simples_nacional';

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

          ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS sale_type TEXT NOT NULL DEFAULT 'pos';
          ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS cost_total NUMERIC(12,2) NOT NULL DEFAULT 0;
          ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS gross_profit NUMERIC(12,2) NOT NULL DEFAULT 0;
          ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS margin_percent NUMERIC(6,2) NOT NULL DEFAULT 0;
          ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS trade_in_value NUMERIC(12,2) NOT NULL DEFAULT 0;
          ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS trade_in_notes TEXT NOT NULL DEFAULT '';
          ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS external_cash_status TEXT NOT NULL DEFAULT 'not_applicable';
          ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS warranty_terms TEXT NOT NULL DEFAULT '';
          ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS warranty_months INT NOT NULL DEFAULT 3;

          ALTER TABLE sales_order_lines ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0;
          ALTER TABLE sales_order_lines ADD COLUMN IF NOT EXISTS total_cost NUMERIC(12,2) NOT NULL DEFAULT 0;

          CREATE TABLE IF NOT EXISTS sales_goals (
            id TEXT PRIMARY KEY,
            store_id TEXT NOT NULL,
            name TEXT NOT NULL,
            goal_type TEXT NOT NULL DEFAULT 'revenue',
            target_value NUMERIC(12,2) NOT NULL DEFAULT 0,
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            seller_id TEXT,
            active BOOLEAN NOT NULL DEFAULT true,
            progressive_tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
            commission_rules JSONB NOT NULL DEFAULT '{"enabled": true, "percent": 10, "type": "percent_revenue", "requires_goal_reached": true}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
          );

          CREATE TABLE IF NOT EXISTS sale_trade_ins (
            id TEXT PRIMARY KEY,
            sale_id TEXT NOT NULL,
            store_id TEXT NOT NULL,
            device_name TEXT NOT NULL,
            imei TEXT NOT NULL DEFAULT '',
            capacity TEXT NOT NULL DEFAULT '',
            color TEXT NOT NULL DEFAULT '',
            condition_state TEXT NOT NULL DEFAULT 'used',
            notes TEXT NOT NULL DEFAULT '',
            trade_value NUMERIC(12,2) NOT NULL DEFAULT 0,
            stock_item_id TEXT,
            status TEXT NOT NULL DEFAULT 'received',
            received_by_seller_id TEXT,
            customer_id TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
          );

          CREATE TABLE IF NOT EXISTS cash_pickups (
            id TEXT PRIMARY KEY,
            store_id TEXT NOT NULL,
            responsible_name TEXT NOT NULL,
            amount NUMERIC(12,2) NOT NULL,
            origin TEXT NOT NULL DEFAULT 'vendas_externas',
            payment_method TEXT NOT NULL DEFAULT 'dinheiro',
            pickup_date DATE NOT NULL DEFAULT CURRENT_DATE,
            notes TEXT NOT NULL DEFAULT '',
            finance_entry_id TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
          );
        EXCEPTION WHEN OTHERS THEN NULL; END $$;
      `);
    } catch (schemaErr) {
      console.warn('[marthi-api] Aviso ao verificar colunas e tabelas:', schemaErr);
    }

    // 2. Limpeza de registros de testes legados
    try {
      await pool.query(`
        DELETE FROM partner_signups WHERE email LIKE '%@marthi.teste' OR email LIKE '%teste@%' OR company_name LIKE '%Alpha%' OR company_name LIKE '%Beta%' OR id LIKE 'PRT-MURC%';
        DELETE FROM auth_tokens WHERE email LIKE '%@marthi.teste' OR email LIKE 'admin.alpha%' OR email LIKE 'admin.beta%';
        DELETE FROM user_stores WHERE user_id IN ('usr-mariana-cellponto', 'usr-gilvan-cellponto') OR (store_id = 'STR-DEMO-01' AND user_id IN (SELECT id FROM users WHERE email IN ('marianaveigatav@gmail.com', 'gilvanteodo@gmail.com', 'gilvancellponto@gmail.com')));
        DELETE FROM employees WHERE store_id = 'STR-DEMO-01' AND (user_email IN ('marianaveigatav@gmail.com', 'gilvanteodo@gmail.com', 'gilvancellponto@gmail.com') OR email IN ('marianaveigatav@gmail.com', 'gilvanteodo@gmail.com', 'gilvancellponto@gmail.com') OR user_email LIKE '%@marthi.teste' OR user_email LIKE 'admin.alpha%' OR user_email LIKE 'admin.beta%');
        DELETE FROM users WHERE id IN ('usr-mariana-cellponto', 'usr-gilvan-cellponto') OR (client_account_id = 'ACC-MARTHI-DEMO' AND email IN ('marianaveigatav@gmail.com', 'gilvanteodo@gmail.com', 'gilvancellponto@gmail.com')) OR email LIKE '%@marthi.teste' OR email LIKE 'admin.alpha%' OR email LIKE 'admin.beta%';
      `);
    } catch (cleanErr) {
      console.warn('[marthi-api] Aviso na limpeza:', cleanErr);
    }

    // 2.1 Garante integridade da conta Cell Ponto
    try {
      await pool.query(`
        UPDATE client_accounts
        SET
          phone = '(24) 99966-3631',
          contact_name = 'Gilvan Teodo',
          trade_name = 'Cell Ponto',
          legal_name = 'CELL PONTO TELECOMUNICACAO LTDA',
          access_token = COALESCE(NULLIF(access_token, ''), 'TK-DSR-000182-9BKJG-YOFB'),
          status = 'active',
          updated_at = now()
        WHERE id = 'PRT-MUM5YWBG8DSR' OR document = '38.297.104/0001-82' OR email = 'gilvanteodo@gmail.com';

        INSERT INTO partner_signups (
          id, plan_id, modules, document_type, document, legal_name, trade_name,
          email, phone, zip_code, street, number, complement, district, city,
          state, segment, contact_name, contact_role, notes, status, monthly_amount,
          payment_method, transaction_ref, audit_trail, created_at, updated_at
        ) VALUES (
          'PRT-MUM5YWBG8DSR', 'golden', '["totem","os","erp","fiscal","ecommerce"]'::jsonb,
          'cnpj', '38.297.104/0001-82', 'CELL PONTO TELECOMUNICACAO LTDA', 'Cell Ponto',
          'gilvanteodo@gmail.com', '(24) 99966-3631', '25800-000', 'Rua Principal', '100', 'Loja',
          'Centro', 'Três Rios', 'RJ', 'telecom', 'Gilvan Teodo', 'Sócio Administrador',
          'Contratação do Plano Golden (Completo)', 'aguardando_pagamento', 597.00,
          'pix', 'PAY-MURQGY7I', '[]'::jsonb, now(), now()
        )
        ON CONFLICT (id) DO UPDATE SET
          trade_name = EXCLUDED.trade_name,
          legal_name = EXCLUDED.legal_name,
          document = EXCLUDED.document,
          email = EXCLUDED.email,
          phone = EXCLUDED.phone,
          contact_name = EXCLUDED.contact_name,
          monthly_amount = EXCLUDED.monthly_amount,
          updated_at = now();
      `);
    } catch (cpErr) {
      console.warn('[marthi-api] Aviso ao sincronizar Cell Ponto:', cpErr);
    }

    // 3. Garante conta da Loja Demonstração Marthi
    try {
      await pool.query(
        `INSERT INTO client_accounts (id, trade_name, legal_name, document_type, document, email, phone, contact_name, status, access_token)
         VALUES ('ACC-MARTHI-DEMO', 'Marthi Demonstração', 'Marthi Tecnologia e Demonstração LTDA', 'cnpj', '00.000.000/0001-91', 'contato@marthi.com.br', '(11) 3000-0000', 'Administrador Marthi', 'active', 'TK-DEMO-000191-MDEM-01')
         ON CONFLICT (id) DO UPDATE SET
           trade_name = 'Marthi Demonstração',
           legal_name = 'Marthi Tecnologia e Demonstração LTDA',
           document = '00.000.000/0001-91',
           email = 'contato@marthi.com.br',
           phone = '(11) 3000-0000',
           access_token = 'TK-DEMO-000191-MDEM-01',
           status = 'active'`,
      );
    } catch (accErr) {
      console.warn('[marthi-api] Aviso ao sincronizar client_accounts:', accErr);
    }

    // 4. Garante loja matriz Demonstração
    try {
      await pool.query(
        `INSERT INTO stores (
          id, client_account_id, trade_name, legal_name, document_type, document,
          state_registration, municipal_registration, email, phone, zip_code, street,
          number, complement, district, city, state, tax_regime, is_matrix, active, access_token
        ) VALUES (
          'STR-DEMO-01', 'ACC-MARTHI-DEMO', 'Loja Demonstração Marthi', 'Marthi Tecnologia e Demonstração LTDA',
          'cnpj', '00.000.000/0001-91', 'ISENTO', '12345', 'loja@marthi.com.br', '(11) 3000-0000',
          '01310-100', 'Avenida Paulista', '1000', 'Sala Demo', 'Bela Vista', 'São Paulo', 'SP',
          'simples_nacional', true, true, 'TK-DEMO-000191-MDEM-01'
        ) ON CONFLICT (id) DO UPDATE SET
          client_account_id = 'ACC-MARTHI-DEMO',
          trade_name = 'Loja Demonstração Marthi',
          legal_name = 'Marthi Tecnologia e Demonstração LTDA',
          document = '00.000.000/0001-91',
          email = 'loja@marthi.com.br',
          phone = '(11) 3000-0000',
          zip_code = '01310-100',
          street = 'Avenida Paulista',
          number = '1000',
          complement = 'Sala Demo',
          district = 'Bela Vista',
          city = 'São Paulo',
          state = 'SP',
          access_token = 'TK-DEMO-000191-MDEM-01',
          active = true,
          is_matrix = true`,
      );
    } catch (strErr) {
      console.warn('[marthi-api] Aviso ao sincronizar stores:', strErr);
    }

    // 5. Garante licença Gold ativa para STR-DEMO-01
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
    try {
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
    } catch (uErr) {
      console.warn('[marthi-api] Aviso ao sincronizar usuário teste:', uErr);
    }

    // 7. Garante usuário marthi.tecnologia@gmail.com como Superadmin
    try {
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
    } catch (admErr) {
      console.warn('[marthi-api] Aviso ao sincronizar usuário superadmin:', admErr);
    }

    // 8. Vínculo user_stores para os administradores
    try {
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
    } catch (ustErr) {
      console.warn('[marthi-api] Aviso ao sincronizar user_stores:', ustErr);
    }

    // 9. Garante colaboradores em employees
    try {
      await pool.query(
        `INSERT INTO employees (id, store_id, name, phone, email, document, role, is_system_user, user_email, access_areas, active, created_at, updated_at)
         VALUES
           ('EMP-TESTE-ADMIN', 'STR-DEMO-01', 'Administrador Marthi', '(11) 3000-0000', 'teste@marthi.com.br', '', 'admin', true, 'teste@marthi.com.br', '["painel","totem","pdv","os","erp","fiscal","ecommerce"]'::jsonb, true, now(), now()),
           ('EMP-MARTHI-ADMIN', 'STR-DEMO-01', 'Marthi Tecnologia', '(11) 3000-0000', 'marthi.tecnologia@gmail.com', '', 'admin', true, 'marthi.tecnologia@gmail.com', '["painel","totem","pdv","os","erp","fiscal","ecommerce"]'::jsonb, true, now(), now())
         ON CONFLICT (id) DO UPDATE SET
           phone = '(11) 3000-0000',
           role = 'admin',
           is_system_user = true,
           access_areas = '["painel","totem","pdv","os","erp","fiscal","ecommerce"]'::jsonb,
           active = true,
           updated_at = now()`,
      );
    } catch (empErr) {
      console.warn('[marthi-api] Aviso ao sincronizar employees:', empErr);
    }

    // 10. Garante produtos no catálogo do Totem e estoque
    try {
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
      }
    } catch (stockErr) {
      console.warn('[marthi-api] Aviso ao verificar estoque:', stockErr);
    }

    console.log('[marthi-api] ✓ MarthiDB pronto e sincronizado!');
  } catch (err) {
    console.warn('[marthi-api] Aviso ao inicializar banco de dados:', err);
  }
}

// Inicia escuta HTTP imediatamente para saúde no Discloud e proxy
app.listen(env.PORT, '0.0.0.0', () => {
  console.log(`[marthi-api] listening on 0.0.0.0:${env.PORT} (${env.APP_ENV})`);
  void bootstrapDatabase().catch((err) => {
    console.warn('[marthi-api] Erro em segundo plano no bootstrap:', err);
  });
});
