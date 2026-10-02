-- Migration 0001: Initial Core Schema
-- Contas Contratantes, Lojas/Filiais (Multi-Loja), Licenciamento por CNPJ,
-- Desconto Progressivo Configurável, Usuários, Clientes, Produtos e Formas de Pagamento.

DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 1. TIPOS E ENUMS
DO $$ BEGIN
  CREATE TYPE plan_id AS ENUM ('start', 'growth', 'scale');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE module_id AS ENUM ('totem', 'presales', 'os', 'erp', 'fiscal', 'ecommerce');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE document_type AS ENUM ('cnpj', 'cpf');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE auth_provider AS ENUM ('google', 'password');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'manager', 'operator', 'technician', 'seller');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE account_status AS ENUM ('active', 'suspended', 'trial', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE license_status AS ENUM ('active', 'trial', 'past_due', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE product_status AS ENUM ('active', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_type AS ENUM ('cash', 'pix', 'debit', 'credit', 'voucher', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. CLIENTE CONTRATANTE / CONTA COMERCIAL (Guarda-chuva Multi-Loja)
CREATE TABLE IF NOT EXISTS client_accounts (
  id            TEXT PRIMARY KEY,
  trade_name    TEXT NOT NULL,
  legal_name    TEXT NOT NULL,
  document_type document_type NOT NULL,
  document      TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL,
  phone         TEXT NOT NULL,
  contact_name  TEXT NOT NULL,
  status        account_status NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. EMPRESAS / LOJAS / CNPJS VINCULADOS (Multi-Loja)
CREATE TABLE IF NOT EXISTS stores (
  id                     TEXT PRIMARY KEY,
  client_account_id      TEXT NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  trade_name             TEXT NOT NULL,
  legal_name             TEXT NOT NULL,
  document_type          document_type NOT NULL DEFAULT 'cnpj',
  document               TEXT NOT NULL, -- CNPJ da Loja/Filial
  state_registration     TEXT NOT NULL DEFAULT '',
  municipal_registration TEXT NOT NULL DEFAULT '',
  email                  TEXT NOT NULL,
  phone                  TEXT NOT NULL,
  zip_code               TEXT NOT NULL,
  street                 TEXT NOT NULL,
  number                 TEXT NOT NULL,
  complement             TEXT NOT NULL DEFAULT '',
  district               TEXT NOT NULL,
  city                   TEXT NOT NULL,
  state                  CHAR(2) NOT NULL,
  tax_regime             TEXT NOT NULL DEFAULT 'simples_nacional',
  is_matrix              BOOLEAN NOT NULL DEFAULT false,
  active                 BOOLEAN NOT NULL DEFAULT true,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_stores_account_document UNIQUE (client_account_id, document)
);

CREATE INDEX IF NOT EXISTS idx_stores_account ON stores(client_account_id);
CREATE INDEX IF NOT EXISTS idx_stores_document ON stores(document);

-- 4. REGRAS CONFIGURÁVEIS DE DESCONTO MULTI-LOJA
CREATE TABLE IF NOT EXISTS licensing_discount_rules (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  min_stores       INT NOT NULL CHECK (min_stores >= 1),
  max_stores       INT, -- NULL = infinito / acima de N
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  discount_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  active           BOOLEAN NOT NULL DEFAULT true,
  sort_order       INT NOT NULL DEFAULT 0,
  notes            TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_licensing_rules_active ON licensing_discount_rules(active, sort_order);

-- 5. LICENCIAMENTO POR CNPJ / LOJA
CREATE TABLE IF NOT EXISTS store_licenses (
  id                TEXT PRIMARY KEY,
  store_id          TEXT NOT NULL UNIQUE REFERENCES stores(id) ON DELETE CASCADE,
  client_account_id TEXT NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  plan_id           plan_id NOT NULL DEFAULT 'scale',
  modules           module_id[] NOT NULL DEFAULT ARRAY['totem', 'presales', 'os', 'erp', 'fiscal']::module_id[],
  base_price        NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_percent  NUMERIC(5,2) NOT NULL DEFAULT 0,
  discount_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  final_price       NUMERIC(12,2) NOT NULL DEFAULT 0,
  billing_cycle     TEXT NOT NULL DEFAULT 'monthly',
  status            license_status NOT NULL DEFAULT 'active',
  starts_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_licenses_store ON store_licenses(store_id);
CREATE INDEX IF NOT EXISTS idx_licenses_account ON store_licenses(client_account_id);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON store_licenses(status);

-- 6. USUÁRIOS E ASSOCIAÇÃO MULTI-LOJA
CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  client_account_id TEXT NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  email             TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  picture           TEXT,
  provider          auth_provider NOT NULL DEFAULT 'password',
  password_hash     TEXT,
  global_role       user_role NOT NULL DEFAULT 'operator',
  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS user_stores (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id    TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  role        user_role NOT NULL DEFAULT 'operator',
  is_default  BOOLEAN NOT NULL DEFAULT false,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_store UNIQUE (user_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_user_stores_user ON user_stores(user_id);
CREATE INDEX IF NOT EXISTS idx_user_stores_store ON user_stores(store_id);

-- 7. CLIENTES (CUSTOMERS) POR LOJA COM ISOLAMENTO
CREATE TABLE IF NOT EXISTS customers (
  id            TEXT PRIMARY KEY,
  store_id      TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  trade_name    TEXT NOT NULL DEFAULT '',
  document_type document_type NOT NULL DEFAULT 'cpf',
  document      TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL,
  phone_digits  TEXT NOT NULL,
  email         TEXT NOT NULL DEFAULT '',
  zip_code      TEXT NOT NULL DEFAULT '',
  street        TEXT NOT NULL DEFAULT '',
  number        TEXT NOT NULL DEFAULT '',
  complement    TEXT NOT NULL DEFAULT '',
  district      TEXT NOT NULL DEFAULT '',
  city          TEXT NOT NULL DEFAULT '',
  state         CHAR(2) NOT NULL DEFAULT '',
  customer_group TEXT NOT NULL DEFAULT 'Padrão',
  credit_limit  NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes         TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_customer_store_phone UNIQUE (store_id, phone_digits)
);

CREATE INDEX IF NOT EXISTS idx_customers_store ON customers(store_id);
CREATE INDEX IF NOT EXISTS idx_customers_doc ON customers(store_id, document);

-- 8. TABELAS DE PREÇO E FORMAS DE PAGAMENTO
CREATE TABLE IF NOT EXISTS price_tables (
  id         TEXT PRIMARY KEY,
  store_id   TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  percent    NUMERIC(6,2) NOT NULL DEFAULT 0,
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_tables_store ON price_tables(store_id);

CREATE TABLE IF NOT EXISTS payment_methods (
  id               TEXT PRIMARY KEY,
  store_id         TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  type             payment_type NOT NULL,
  price_table_id   TEXT NOT NULL REFERENCES price_tables(id),
  max_installments INT NOT NULL DEFAULT 1 CHECK (max_installments >= 1),
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_store ON payment_methods(store_id);

-- 9. MARCAS E CATÁLOGO DE PRODUTOS
CREATE TABLE IF NOT EXISTS brands (
  id         TEXT PRIMARY KEY,
  store_id   TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  slug       TEXT NOT NULL,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_brand_store_slug UNIQUE (store_id, slug)
);

CREATE TABLE IF NOT EXISTS products (
  id          TEXT PRIMARY KEY,
  store_id    TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  brand_id    TEXT REFERENCES brands(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  status      product_status NOT NULL DEFAULT 'active',
  reference   TEXT,
  cash_price  NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort        INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_store ON products(store_id);

CREATE TABLE IF NOT EXISTS product_images (
  id         TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  sort       INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_attributes (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  use_on_totem    BOOLEAN NOT NULL DEFAULT true,
  filter_on_totem BOOLEAN NOT NULL DEFAULT false,
  use_on_stock    BOOLEAN NOT NULL DEFAULT true,
  sort            INT NOT NULL DEFAULT 0,
  active          BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS product_attribute_values (
  id           TEXT PRIMARY KEY,
  attribute_id TEXT NOT NULL REFERENCES product_attributes(id) ON DELETE CASCADE,
  value        TEXT NOT NULL,
  price_delta  NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort         INT NOT NULL DEFAULT 0,
  UNIQUE (attribute_id, value)
);
