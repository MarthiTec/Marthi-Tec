-- Migration 0006: Finance, Bank Accounts, Treasury, and Initial Seed
-- Contas Bancárias, Contas a Pagar/Receber, Fluxo Financeiro, Regras de Desconto Multi-Loja e Seeds Iniciais.

DO $$ BEGIN
  CREATE TYPE finance_entry_type AS ENUM ('in', 'out');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE bill_status AS ENUM ('open', 'partial', 'paid', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE finance_source AS ENUM (
    'manual', 'pos', 'pos_adhoc', 'os', 'os_part', 'os_purchase', 'os_revenue', 'os_reversal', 'supplier_order', 'quote'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE bank_account_type AS ENUM ('checking', 'savings', 'cash', 'digital');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. CONTAS BANCÁRIAS E CAIXAS INTERNOS
CREATE TABLE IF NOT EXISTS bank_accounts (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  bank            TEXT NOT NULL DEFAULT '',
  agency          TEXT NOT NULL DEFAULT '',
  number          TEXT NOT NULL DEFAULT '',
  type            bank_account_type NOT NULL DEFAULT 'checking',
  initial_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  current_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_store ON bank_accounts(store_id);

-- 2. CONTAS A PAGAR (PAYABLES)
CREATE TABLE IF NOT EXISTS payables (
  id            TEXT PRIMARY KEY,
  store_id      TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  description   TEXT NOT NULL,
  supplier_id   TEXT,
  supplier_name TEXT NOT NULL DEFAULT '',
  category      TEXT NOT NULL DEFAULT 'Geral',
  amount        NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  paid_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_date      DATE NOT NULL,
  status        bill_status NOT NULL DEFAULT 'open',
  account_id    TEXT REFERENCES bank_accounts(id) ON DELETE SET NULL,
  paid_at       TIMESTAMPTZ,
  notes         TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payables_store_due ON payables(store_id, due_date, status);

-- 3. CONTAS A RECEBER (RECEIVABLES)
CREATE TABLE IF NOT EXISTS receivables (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  description     TEXT NOT NULL,
  customer_id     TEXT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name   TEXT NOT NULL DEFAULT '',
  category        TEXT NOT NULL DEFAULT 'Vendas',
  amount          NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  received_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_date        DATE NOT NULL,
  status          bill_status NOT NULL DEFAULT 'open',
  account_id      TEXT REFERENCES bank_accounts(id) ON DELETE SET NULL,
  sale_id         TEXT REFERENCES sales_orders(id) ON DELETE SET NULL,
  quote_id        TEXT REFERENCES pos_quotes(id) ON DELETE SET NULL,
  os_id           TEXT REFERENCES work_orders(id) ON DELETE SET NULL,
  received_at     TIMESTAMPTZ,
  notes           TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receivables_store_due ON receivables(store_id, due_date, status);

-- 4. LIVRO CAIXA E FLUXO GERAL (FINANCE ENTRIES)
CREATE TABLE IF NOT EXISTS finance_entries (
  id            TEXT PRIMARY KEY,
  store_id      TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  type          finance_entry_type NOT NULL,
  label         TEXT NOT NULL,
  amount        NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  source        finance_source NOT NULL DEFAULT 'manual',
  ref_id        TEXT,
  account_id    TEXT REFERENCES bank_accounts(id) ON DELETE SET NULL,
  category      TEXT NOT NULL DEFAULT 'Operacional',
  operator_name TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_entries_store ON finance_entries(store_id, created_at DESC);

-- 5. MOVIMENTAÇÕES DE TESOURARIA (TRANSFERÊNCIAS ENTRE CONTAS)
CREATE TABLE IF NOT EXISTS treasury_moves (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL DEFAULT 'transfer',
  from_account_id TEXT NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  to_account_id   TEXT NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  description     TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 6. SEED INICIAL IDEMPOTENTE (CONTA COMERCIAL, MULTI-LOJA, LICENÇAS E REGRAS)
-- ==============================================================================

-- 6.1 Regras de Desconto Progressivo Multi-Loja
INSERT INTO licensing_discount_rules (id, name, min_stores, max_stores, discount_percent, sort_order, notes)
VALUES
  ('RULE-1-STORE',  '1 Loja (Sem Desconto)',   1, 1,    0.00,  1, 'Preço regular de tabela para loja única'),
  ('RULE-2-STORES', '2 Lojas (15% Desconto)',  2, 2,   15.00,  2, '15% de desconto a partir da 2ª loja'),
  ('RULE-3-STORES', '3 a 5 Lojas (25% OFF)',   3, 5,   25.00,  3, '25% de desconto para redes de 3 a 5 lojas'),
  ('RULE-6-STORES', '6+ Lojas (35% OFF)',      6, NULL, 35.00, 4, '35% de desconto para grandes redes (6+ lojas)')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  min_stores = EXCLUDED.min_stores,
  max_stores = EXCLUDED.max_stores,
  discount_percent = EXCLUDED.discount_percent;

-- 6.2 Conta Comercial Cliente Demo
INSERT INTO client_accounts (id, trade_name, legal_name, document_type, document, email, phone, contact_name, status)
VALUES (
  'ACC-MARTHI-DEMO',
  'Marthi Tecnologia',
  'Marthi Soluções em Tecnologia LTDA',
  'cnpj',
  '61.506.270/0001-63',
  'marthi.tecnologia@gmail.com',
  '(24) 98124-4253',
  'Matheus Marçal',
  'active'
)
ON CONFLICT (document) DO UPDATE SET
  trade_name = EXCLUDED.trade_name,
  legal_name = EXCLUDED.legal_name;

-- 6.3 Lojas / CNPJs Vinculados (Loja Matriz e Loja Filial)
INSERT INTO stores (
  id, client_account_id, trade_name, legal_name, document_type, document,
  state_registration, municipal_registration, email, phone, zip_code, street,
  number, complement, district, city, state, tax_regime, is_matrix, active
)
VALUES
(
  'STR-DEMO-01',
  'ACC-MARTHI-DEMO',
  'Cell Ponto Matriz',
  'Marthi Soluções em Tecnologia LTDA',
  'cnpj',
  '61.506.270/0001-63',
  'ISENTO',
  '12345',
  'matriz@cellponto.com.br',
  '(24) 98124-4253',
  '25800-000',
  'Rua Prefeito Walter Franklin',
  '120',
  'Loja 01',
  'Centro',
  'Três Rios',
  'RJ',
  'simples_nacional',
  true,
  true
),
(
  'STR-DEMO-02',
  'ACC-MARTHI-DEMO',
  'Cell Ponto Shopping (Filial)',
  'Marthi Soluções em Tecnologia LTDA',
  'cnpj',
  '61.506.270/0002-44',
  'ISENTO',
  '12346',
  'filial.shopping@cellponto.com.br',
  '(24) 98124-4254',
  '25800-000',
  'Av. Alberto Lavinas',
  '500',
  'Shopping Olga Sola - Quiosque 4',
  'Centro',
  'Três Rios',
  'RJ',
  'simples_nacional',
  false,
  true
)
ON CONFLICT (client_account_id, document) DO UPDATE SET
  trade_name = EXCLUDED.trade_name,
  active = EXCLUDED.active;

-- 6.4 Licenças por CNPJ (com cálculo de desconto multi-loja)
DO $$ BEGIN
  ALTER TABLE stores ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE store_licenses ALTER COLUMN plan_id DROP DEFAULT;
  ALTER TABLE store_licenses ALTER COLUMN plan_id TYPE TEXT USING plan_id::TEXT;
  ALTER TABLE store_licenses ALTER COLUMN plan_id SET DEFAULT 'scale';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  INSERT INTO store_licenses (
    id, store_id, client_account_id, plan_id, modules, base_price,
    discount_percent, discount_amount, final_price, status
  )
  VALUES
  (
    'LIC-DEMO-01',
    'STR-DEMO-01',
    'ACC-MARTHI-DEMO',
    'scale',
    ARRAY['totem', 'presales', 'os', 'erp', 'fiscal']::module_id[],
    597.00,
    0.00,
    0.00,
    597.00,
    'active'
  ),
  (
    'LIC-DEMO-02',
    'STR-DEMO-02',
    'ACC-MARTHI-DEMO',
    'scale',
    ARRAY['totem', 'presales', 'os', 'erp', 'fiscal']::module_id[],
    597.00,
    15.00, -- Desconto de 15% por ser 2ª loja da mesma conta
    89.55,
    507.45,
    'active'
  )
  ON CONFLICT (store_id) DO UPDATE SET
    plan_id = EXCLUDED.plan_id,
    base_price = EXCLUDED.base_price,
    discount_percent = EXCLUDED.discount_percent,
    final_price = EXCLUDED.final_price,
    status = EXCLUDED.status;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 6.5 Tabelas de Preço Padrão
INSERT INTO price_tables (id, store_id, name, percent, active)
VALUES
  ('TAB-PADRAO-01', 'STR-DEMO-01', 'Padrão / À vista', 0, true),
  ('TAB-CARTAO-01', 'STR-DEMO-01', 'Cartão', 5, true),
  ('TAB-ATACADO-01', 'STR-DEMO-01', 'Atacado / Técnico', -10, true),
  ('TAB-PADRAO-02', 'STR-DEMO-02', 'Padrão / À vista', 0, true),
  ('TAB-CARTAO-02', 'STR-DEMO-02', 'Cartão', 5, true)
ON CONFLICT (id) DO NOTHING;

-- 6.6 Formas de Pagamento Padrão
INSERT INTO payment_methods (id, store_id, name, type, price_table_id, max_installments, active)
VALUES
  ('PAY-DIN-01', 'STR-DEMO-01', 'Dinheiro', 'cash', 'TAB-PADRAO-01', 1, true),
  ('PAY-PIX-01', 'STR-DEMO-01', 'Pix', 'pix', 'TAB-PADRAO-01', 1, true),
  ('PAY-DEB-01', 'STR-DEMO-01', 'Cartão de Débito', 'debit', 'TAB-CARTAO-01', 1, true),
  ('PAY-CRE-01', 'STR-DEMO-01', 'Cartão de Crédito', 'credit', 'TAB-CARTAO-01', 12, true),
  ('PAY-DIN-02', 'STR-DEMO-02', 'Dinheiro', 'cash', 'TAB-PADRAO-02', 1, true),
  ('PAY-PIX-02', 'STR-DEMO-02', 'Pix', 'pix', 'TAB-PADRAO-02', 1, true),
  ('PAY-CRE-02', 'STR-DEMO-02', 'Cartão de Crédito', 'credit', 'TAB-CARTAO-02', 12, true)
ON CONFLICT (id) DO NOTHING;

-- 6.7 Usuários e Associação Multi-Loja
INSERT INTO users (id, client_account_id, email, name, global_role, active)
VALUES
  ('USR-ADMIN', 'ACC-MARTHI-DEMO', 'marthi.tecnologia@gmail.com', 'Administrador Marthi', 'admin', true),
  ('USR-OPERADOR', 'ACC-MARTHI-DEMO', 'teste@marthi.com.br', 'Operador Caixa', 'operator', true)
ON CONFLICT (email) DO NOTHING;

INSERT INTO user_stores (id, user_id, store_id, role, is_default, permissions)
VALUES
  ('UST-ADM-01', 'USR-ADMIN', 'STR-DEMO-01', 'admin', true, '{"all": true}'::jsonb),
  ('UST-ADM-02', 'USR-ADMIN', 'STR-DEMO-02', 'admin', false, '{"all": true}'::jsonb),
  ('UST-OP-01',  'USR-OPERADOR', 'STR-DEMO-01', 'operator', true, '{"pos": true, "ad_hoc": true}'::jsonb),
  ('UST-OP-02',  'USR-OPERADOR', 'STR-DEMO-02', 'operator', false, '{"pos": true, "ad_hoc": true}'::jsonb)
ON CONFLICT (id) DO NOTHING;
