-- Cadastro de produto: tipos de produto da loja, grupos e subgrupos (nome configurável, ex.: Família),
-- data de entrada, DUN-14 e conversão de unidade (compra em caixa, venda por unidade).

CREATE TABLE IF NOT EXISTS product_types (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS product_types_store_name ON product_types(store_id, lower(name));

-- parent_id vazio = grupo; preenchido = subgrupo daquele grupo.
CREATE TABLE IF NOT EXISTS product_groups (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES product_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS product_groups_store_parent_name ON product_groups(store_id, COALESCE(parent_id, ''), lower(name));

ALTER TABLE stores ADD COLUMN IF NOT EXISTS product_group_label TEXT NOT NULL DEFAULT 'Grupo';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS product_subgroup_label TEXT NOT NULL DEFAULT 'Subgrupo';

ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS product_type_id TEXT REFERENCES product_types(id) ON DELETE SET NULL;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS group_id TEXT REFERENCES product_groups(id) ON DELETE SET NULL;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS subgroup_id TEXT REFERENCES product_groups(id) ON DELETE SET NULL;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS entry_date DATE;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS dun14 TEXT NOT NULL DEFAULT '';
-- Ex.: compra em CX com 12 → purchase_unit 'CX', purchase_factor 12 (estoque e venda continuam na unidade).
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS purchase_unit TEXT NOT NULL DEFAULT '';
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS purchase_factor NUMERIC(12,3) NOT NULL DEFAULT 1;
