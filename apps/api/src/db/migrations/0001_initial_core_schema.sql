-- ============================================================================
-- 0001_initial_core_schema.sql
-- Marthi - Schema Principal Consolidado (Single Source of Truth)
--
-- Contém a estrutura completa e essencial de banco de dados para a plataforma:
-- 1. Tenants, Lojas e Licenciamento (Multi-Loja)
-- 2. Usuários, Permissões, Colaboradores e Autenticação
-- 3. Cadastros Base: Clientes, Fornecedores e Vendedores
-- 4. Catálogo, Atributos de Produtos e Estoque Unificado
-- 5. PDV, Sessões de Caixa, Tickets, Vendas e Ordens de Serviço (OS)
-- 6. Módulo Financeiro: Contas Bancárias, Contas a Pagar/Receber e Livro Caixa
-- 7. Tabelas de Preço, Formas de Pagamento e Regras de Licenciamento
-- 8. Contratação de Parceiros (Self-Service) e Logs de Auditoria
--
-- NOTA: Todos os logins manuais legados foram removidos deste schema.
-- Os únicos usuários autorizados são provisionados no bootstrap do sistema:
-- - teste@marthi.com.br (Administrador da Loja)
-- - marthi.tecnologia@gmail.com (Superadmin Marthi)
-- ============================================================================

DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- 1. TIPOS E ENUMS
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE document_type AS ENUM ('cnpj', 'cpf');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE stock_kind AS ENUM ('device', 'part', 'service');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE stock_condition AS ENUM ('new', 'used', 'refurbished');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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

-- ----------------------------------------------------------------------------
-- 2. TENANTS, LOJAS E CONTRATAÇÕES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS partner_signups (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL DEFAULT 'golden',
  modules JSONB NOT NULL DEFAULT '[]'::jsonb,
  document_type TEXT NOT NULL DEFAULT 'cnpj',
  document TEXT NOT NULL,
  legal_name TEXT NOT NULL,
  trade_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  zip_code TEXT NOT NULL DEFAULT '',
  street TEXT NOT NULL DEFAULT '',
  number TEXT NOT NULL DEFAULT '',
  complement TEXT DEFAULT '',
  district TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  state CHAR(2) NOT NULL DEFAULT '',
  segment TEXT DEFAULT '',
  contact_name TEXT NOT NULL,
  contact_role TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'aguardando_pagamento',
  monthly_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method TEXT DEFAULT 'pix',
  transaction_ref TEXT,
  payment_confirmed_at TIMESTAMPTZ,
  activation_token_sent_at TIMESTAMPTZ,
  audit_trail JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_signups_doc ON partner_signups(document);
CREATE INDEX IF NOT EXISTS idx_partner_signups_email ON partner_signups(email);
CREATE INDEX IF NOT EXISTS idx_partner_signups_status ON partner_signups(status);

CREATE TABLE IF NOT EXISTS client_accounts (
  id TEXT PRIMARY KEY,
  trade_name TEXT NOT NULL,
  legal_name TEXT NOT NULL,
  document_type TEXT NOT NULL DEFAULT 'cnpj',
  document TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  access_token TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  client_account_id TEXT NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  trade_name TEXT NOT NULL,
  legal_name TEXT NOT NULL,
  document_type TEXT NOT NULL DEFAULT 'cnpj',
  document TEXT NOT NULL,
  state_registration TEXT NOT NULL DEFAULT '',
  municipal_registration TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT 'contato@marthi.com.br',
  phone TEXT NOT NULL DEFAULT '(24) 99999-9999',
  zip_code TEXT NOT NULL DEFAULT '',
  street TEXT NOT NULL DEFAULT '',
  number TEXT NOT NULL DEFAULT '',
  complement TEXT DEFAULT '',
  district TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  state CHAR(2) NOT NULL DEFAULT '',
  tax_regime TEXT NOT NULL DEFAULT 'simples_nacional',
  is_matrix BOOLEAN NOT NULL DEFAULT true,
  active BOOLEAN NOT NULL DEFAULT true,
  totem_exit_password TEXT DEFAULT '1234',
  totem_settings JSONB DEFAULT '{}'::jsonb,
  communication_settings JSONB DEFAULT '{}'::jsonb,
  access_token TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stores_account ON stores(client_account_id);
CREATE INDEX IF NOT EXISTS idx_stores_document ON stores(document);

CREATE TABLE IF NOT EXISTS store_licenses (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  client_account_id TEXT NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL DEFAULT 'scale',
  modules TEXT[] NOT NULL DEFAULT ARRAY['totem', 'os', 'erp', 'fiscal', 'ecommerce']::TEXT[],
  base_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  final_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  billing_cycle TEXT NOT NULL DEFAULT 'monthly',
  status TEXT NOT NULL DEFAULT 'active',
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_store_licenses_store_id UNIQUE (store_id)
);

CREATE INDEX IF NOT EXISTS idx_licenses_store ON store_licenses(store_id);
CREATE INDEX IF NOT EXISTS idx_licenses_account ON store_licenses(client_account_id);

CREATE TABLE IF NOT EXISTS licensing_discount_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  min_stores INT NOT NULL CHECK (min_stores >= 1),
  max_stores INT,
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  sort_order INT NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT ''
);

-- ----------------------------------------------------------------------------
-- 3. USUÁRIOS, COLABORADORES E PERMISSÕES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  client_account_id TEXT NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  store_id TEXT REFERENCES stores(id) ON DELETE SET NULL,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  picture TEXT,
  provider TEXT NOT NULL DEFAULT 'password',
  password_hash TEXT,
  global_role TEXT NOT NULL DEFAULT 'operator',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_account ON users(client_account_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS user_stores (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'operator',
  is_default BOOLEAN NOT NULL DEFAULT false,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_store UNIQUE (user_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_user_stores_user ON user_stores(user_id);
CREATE INDEX IF NOT EXISTS idx_user_stores_store ON user_stores(store_id);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  document TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'operator',
  is_system_user BOOLEAN NOT NULL DEFAULT false,
  user_email TEXT NOT NULL DEFAULT '',
  access_areas JSONB NOT NULL DEFAULT '[]'::jsonb,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  seller_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employees_store ON employees(store_id);
CREATE INDEX IF NOT EXISTS idx_employees_user_email ON employees(user_email);

-- ----------------------------------------------------------------------------
-- 4. CADASTROS BASE: CLIENTES, FORNECEDORES E VENDEDORES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trade_name TEXT NOT NULL DEFAULT '',
  document TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_store ON suppliers(store_id);

CREATE TABLE IF NOT EXISTS sellers (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  document TEXT NOT NULL DEFAULT '',
  commission_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sellers_store ON sellers(store_id);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trade_name TEXT NOT NULL DEFAULT '',
  document_type TEXT NOT NULL DEFAULT 'cpf',
  document TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL,
  phone_digits TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  zip_code TEXT NOT NULL DEFAULT '',
  street TEXT NOT NULL DEFAULT '',
  number TEXT NOT NULL DEFAULT '',
  complement TEXT NOT NULL DEFAULT '',
  district TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  state CHAR(2) NOT NULL DEFAULT '',
  customer_group TEXT NOT NULL DEFAULT 'Padrão',
  credit_limit NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_customer_store_phone UNIQUE (store_id, phone_digits)
);

CREATE INDEX IF NOT EXISTS idx_customers_store ON customers(store_id);
CREATE INDEX IF NOT EXISTS idx_customers_doc ON customers(store_id, document);

-- ----------------------------------------------------------------------------
-- 5. CATÁLOGO, ATRIBUTOS E ESTOQUE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brands (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_brand_store_slug UNIQUE (store_id, slug)
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  brand_id TEXT REFERENCES brands(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  reference TEXT,
  cash_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_store ON products(store_id);

CREATE TABLE IF NOT EXISTS product_attributes (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  use_on_totem BOOLEAN NOT NULL DEFAULT true,
  filter_on_totem BOOLEAN NOT NULL DEFAULT false,
  use_on_stock BOOLEAN NOT NULL DEFAULT true,
  sort INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_attributes_store ON product_attributes(store_id);

CREATE TABLE IF NOT EXISTS product_attribute_values (
  id TEXT PRIMARY KEY,
  attribute_id TEXT NOT NULL REFERENCES product_attributes(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  price_delta NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort INT NOT NULL DEFAULT 0,
  CONSTRAINT uq_attr_value UNIQUE (attribute_id, value)
);

CREATE INDEX IF NOT EXISTS idx_attr_values_attr ON product_attribute_values(attribute_id);

CREATE TABLE IF NOT EXISTS product_allowed_values (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  attribute_id TEXT NOT NULL REFERENCES product_attributes(id) ON DELETE CASCADE,
  value_id TEXT NOT NULL REFERENCES product_attribute_values(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_items (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  sku TEXT NOT NULL DEFAULT '',
  barcode TEXT NOT NULL DEFAULT '',
  imei TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT 'UN',
  qty INT NOT NULL DEFAULT 0,
  min_qty INT NOT NULL DEFAULT 1,
  cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'device',
  condition TEXT NOT NULL DEFAULT 'new',
  category TEXT NOT NULL DEFAULT 'Geral',
  brand TEXT NOT NULL DEFAULT '',
  attrs JSONB NOT NULL DEFAULT '{}'::jsonb,
  color TEXT NOT NULL DEFAULT '',
  capacity TEXT NOT NULL DEFAULT '',
  card_rate NUMERIC(6,2) NOT NULL DEFAULT 0,
  show_on_totem BOOLEAN NOT NULL DEFAULT true,
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  variations JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_items_store ON stock_items(store_id);
CREATE INDEX IF NOT EXISTS idx_stock_items_totem ON stock_items(store_id, show_on_totem);
CREATE INDEX IF NOT EXISTS idx_stock_items_sku ON stock_items(store_id, sku);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  stock_item_id TEXT NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  qty INT NOT NULL,
  cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  ref_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_store ON stock_movements(store_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(stock_item_id);

CREATE TABLE IF NOT EXISTS stock_inventories (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS stock_inventory_items (
  id TEXT PRIMARY KEY,
  inventory_id TEXT NOT NULL REFERENCES stock_inventories(id) ON DELETE CASCADE,
  stock_item_id TEXT NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  expected_qty INT NOT NULL DEFAULT 0,
  counted_qty INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS stock_invoices (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  number TEXT NOT NULL DEFAULT '',
  series TEXT NOT NULL DEFAULT '',
  issue_date DATE,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_invoice_lines (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES stock_invoices(id) ON DELETE CASCADE,
  stock_item_id TEXT NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  qty INT NOT NULL DEFAULT 1,
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cost NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_lots (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  stock_item_id TEXT NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  lot_number TEXT NOT NULL,
  qty INT NOT NULL DEFAULT 0,
  expiry_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_kits (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_kit_items (
  id TEXT PRIMARY KEY,
  kit_id TEXT NOT NULL REFERENCES product_kits(id) ON DELETE CASCADE,
  stock_item_id TEXT NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  qty INT NOT NULL DEFAULT 1
);

-- ----------------------------------------------------------------------------
-- 6. PDV, SESSÕES DE CAIXA, VENDAS E ORDENS DE SERVIÇO
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_terminals (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cash_sessions (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  terminal_id TEXT REFERENCES pos_terminals(id) ON DELETE SET NULL,
  operator_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  initial_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  closed_amount NUMERIC(12,2),
  status TEXT NOT NULL DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS cash_session_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cash_movements (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pos_tickets (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pos_ticket_attributes (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES pos_tickets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pos_quotes (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pos_quote_lines (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES pos_quotes(id) ON DELETE CASCADE,
  stock_item_id TEXT REFERENCES stock_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  qty INT NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_price NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sales_orders (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  seller_id TEXT REFERENCES sellers(id) ON DELETE SET NULL,
  session_id TEXT REFERENCES cash_sessions(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  final_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed',
  source TEXT NOT NULL DEFAULT 'pos',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_orders_store ON sales_orders(store_id);

CREATE TABLE IF NOT EXISTS sales_order_lines (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  stock_item_id TEXT REFERENCES stock_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  qty INT NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_price NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sale_payments (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  installments INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS work_orders (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  device_brand TEXT NOT NULL DEFAULT '',
  device_model TEXT NOT NULL DEFAULT '',
  serial_or_imei TEXT NOT NULL DEFAULT '',
  defect_description TEXT NOT NULL DEFAULT '',
  technical_report TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'opened',
  labor_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  parts_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS work_order_items (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  stock_item_id TEXT REFERENCES stock_items(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  qty INT NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_price NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS work_order_history (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  operator_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 7. FINANCEIRO: CONTAS, PAGAR, RECEBER E TESOURARIA
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bank_accounts (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  bank TEXT NOT NULL DEFAULT '',
  agency TEXT NOT NULL DEFAULT '',
  number TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'checking',
  initial_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  current_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_store ON bank_accounts(store_id);

CREATE TABLE IF NOT EXISTS payables (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Geral',
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  status bill_status NOT NULL DEFAULT 'open',
  account_id TEXT REFERENCES bank_accounts(id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ,
  notes TEXT NOT NULL DEFAULT '',
  document_number TEXT NOT NULL DEFAULT '',
  interest_amount NUMERIC(12,2) DEFAULT 0,
  fine_amount NUMERIC(12,2) DEFAULT 0,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  invoice_id TEXT,
  invoice_number TEXT DEFAULT '',
  invoice_type TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payables_store ON payables(store_id);
CREATE INDEX IF NOT EXISTS idx_payables_due ON payables(store_id, due_date, status);

CREATE TABLE IF NOT EXISTS receivables (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Vendas',
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  received_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  status bill_status NOT NULL DEFAULT 'open',
  account_id TEXT REFERENCES bank_accounts(id) ON DELETE SET NULL,
  sale_id TEXT REFERENCES sales_orders(id) ON DELETE SET NULL,
  quote_id TEXT REFERENCES pos_quotes(id) ON DELETE SET NULL,
  os_id TEXT REFERENCES work_orders(id) ON DELETE SET NULL,
  received_at TIMESTAMPTZ,
  notes TEXT NOT NULL DEFAULT '',
  document_number TEXT NOT NULL DEFAULT '',
  interest_amount NUMERIC(12,2) DEFAULT 0,
  fine_amount NUMERIC(12,2) DEFAULT 0,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  invoice_id TEXT,
  invoice_number TEXT DEFAULT '',
  invoice_type TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receivables_store ON receivables(store_id);
CREATE INDEX IF NOT EXISTS idx_receivables_due ON receivables(store_id, due_date, status);

CREATE TABLE IF NOT EXISTS finance_entries (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  type finance_entry_type NOT NULL,
  label TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  source finance_source NOT NULL DEFAULT 'manual',
  ref_id TEXT,
  account_id TEXT REFERENCES bank_accounts(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'Operacional',
  operator_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_entries_store ON finance_entries(store_id, created_at DESC);

CREATE TABLE IF NOT EXISTS treasury_moves (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'transfer',
  from_account_id TEXT NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  to_account_id TEXT NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 8. PREÇOS, PAGAMENTOS E PROMOÇÕES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS price_tables (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  percent NUMERIC(6,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_tables_store ON price_tables(store_id);

CREATE TABLE IF NOT EXISTS payment_methods (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  price_table_id TEXT NOT NULL REFERENCES price_tables(id),
  max_installments INT NOT NULL DEFAULT 1 CHECK (max_installments >= 1),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_store ON payment_methods(store_id);

CREATE TABLE IF NOT EXISTS promo_campaigns (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS promo_campaign_tiers (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES promo_campaigns(id) ON DELETE CASCADE,
  min_qty INT NOT NULL DEFAULT 1,
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0
);

-- ----------------------------------------------------------------------------
-- 9. AUTENTICAÇÃO, TOKENS E AUDITORIA
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  email TEXT NOT NULL,
  client_id TEXT,
  name TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash ON auth_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_email ON auth_tokens(email);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  store_id TEXT,
  user_id TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_store ON audit_logs(store_id);

CREATE TABLE IF NOT EXISTS audit_email_logs (
  id TEXT PRIMARY KEY,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  sender TEXT NOT NULL,
  status TEXT NOT NULL,
  message_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON audit_email_logs(recipient);

-- ----------------------------------------------------------------------------
-- 10. DADOS PADRÃO DO SISTEMA (TABELAS DE SISTEMA)
-- ----------------------------------------------------------------------------
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
