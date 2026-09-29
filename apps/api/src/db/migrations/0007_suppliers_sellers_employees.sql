-- Migration 0007: Suppliers, Sellers and Store Employees
-- Suporte completo a Fornecedores, Vendedores e Colaboradores da Loja com isolamento multi-loja.

CREATE TABLE IF NOT EXISTS suppliers (
  id         TEXT PRIMARY KEY,
  store_id   TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  trade_name TEXT NOT NULL DEFAULT '',
  document   TEXT NOT NULL DEFAULT '',
  phone      TEXT NOT NULL DEFAULT '',
  email      TEXT NOT NULL DEFAULT '',
  city       TEXT NOT NULL DEFAULT '',
  notes      TEXT NOT NULL DEFAULT '',
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_store ON suppliers(store_id);

CREATE TABLE IF NOT EXISTS sellers (
  id                 TEXT PRIMARY KEY,
  store_id           TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  phone              TEXT NOT NULL DEFAULT '',
  email              TEXT NOT NULL DEFAULT '',
  document           TEXT NOT NULL DEFAULT '',
  commission_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  active             BOOLEAN NOT NULL DEFAULT true,
  employee_id        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sellers_store ON sellers(store_id);

CREATE TABLE IF NOT EXISTS employees (
  id             TEXT PRIMARY KEY,
  store_id       TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  phone          TEXT NOT NULL DEFAULT '',
  email          TEXT NOT NULL DEFAULT '',
  document       TEXT NOT NULL DEFAULT '',
  role           TEXT NOT NULL DEFAULT 'operator',
  is_system_user BOOLEAN NOT NULL DEFAULT false,
  user_email     TEXT NOT NULL DEFAULT '',
  access_areas   JSONB NOT NULL DEFAULT '[]'::jsonb,
  permissions    JSONB NOT NULL DEFAULT '{}'::jsonb,
  active         BOOLEAN NOT NULL DEFAULT true,
  seller_id      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employees_store ON employees(store_id);
CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(store_id, active);
