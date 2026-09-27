-- Migration 0002: Stock and Inventory
-- Itens de Estoque, Kardex / Movimentações, Balanço Físico e Inventário com Isolamento por Loja.

DO $$ BEGIN
  CREATE TYPE stock_kind AS ENUM ('part', 'device', 'supply');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE stock_condition AS ENUM ('new', 'used', 'refurbished');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE stock_movement_type AS ENUM (
    'in', 'out', 'adjustment', 'inventory', 'sale', 'os', 'devolution'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inventory_status AS ENUM ('draft', 'in_progress', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. ITENS DE ESTOQUE
CREATE TABLE IF NOT EXISTS stock_items (
  id           TEXT PRIMARY KEY,
  store_id     TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id   TEXT REFERENCES products(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  sku          TEXT NOT NULL DEFAULT '',
  barcode      TEXT NOT NULL DEFAULT '',
  imei         TEXT NOT NULL DEFAULT '',
  unit         TEXT NOT NULL DEFAULT 'UN',
  qty          NUMERIC(12,3) NOT NULL DEFAULT 0,
  min_qty      NUMERIC(12,3) NOT NULL DEFAULT 0,
  cost         NUMERIC(12,2) NOT NULL DEFAULT 0,
  price        NUMERIC(12,2) NOT NULL DEFAULT 0,
  kind         stock_kind NOT NULL DEFAULT 'part',
  condition    stock_condition NOT NULL DEFAULT 'new',
  category     TEXT NOT NULL DEFAULT '',
  brand        TEXT NOT NULL DEFAULT '',
  supplier_id  TEXT,
  track_lot    BOOLEAN NOT NULL DEFAULT false,
  is_kit       BOOLEAN NOT NULL DEFAULT false,
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_items_store ON stock_items(store_id);
CREATE INDEX IF NOT EXISTS idx_stock_items_sku ON stock_items(store_id, sku);
CREATE INDEX IF NOT EXISTS idx_stock_items_barcode ON stock_items(store_id, barcode);
CREATE INDEX IF NOT EXISTS idx_stock_items_name ON stock_items(store_id, name);

-- 2. KARDEX / MOVIMENTAÇÕES DE ESTOQUE
CREATE TABLE IF NOT EXISTS stock_movements (
  id            TEXT PRIMARY KEY,
  store_id      TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  stock_id      TEXT NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  type          stock_movement_type NOT NULL,
  qty           NUMERIC(12,3) NOT NULL,
  previous_qty  NUMERIC(12,3) NOT NULL DEFAULT 0,
  new_qty       NUMERIC(12,3) NOT NULL DEFAULT 0,
  unit_cost     NUMERIC(12,2) NOT NULL DEFAULT 0,
  ref_type      TEXT NOT NULL DEFAULT 'manual', -- 'sale', 'os', 'inventory', 'adjustment', 'devolution'
  ref_id        TEXT,
  operator_name TEXT NOT NULL DEFAULT '',
  notes         TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_store ON stock_movements(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(stock_id, created_at DESC);

-- 3. SESSÕES DE BALANÇO DE ESTOQUE / INVENTÁRIO FÍSICO
CREATE TABLE IF NOT EXISTS stock_inventories (
  id               TEXT PRIMARY KEY,
  store_id         TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  code             TEXT NOT NULL,
  title            TEXT NOT NULL,
  status           inventory_status NOT NULL DEFAULT 'in_progress',
  responsible_user TEXT NOT NULL,
  warehouse_name   TEXT NOT NULL DEFAULT 'Principal',
  duplicate_rule   TEXT NOT NULL DEFAULT 'sum', -- 'sum' ou 'overwrite'
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ,
  duration_seconds INT NOT NULL DEFAULT 0,
  notes            TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventories_store ON stock_inventories(store_id, status);

-- 4. ITENS DO BALANÇO / CONFERÊNCIA
CREATE TABLE IF NOT EXISTS stock_inventory_items (
  id             TEXT PRIMARY KEY,
  inventory_id   TEXT NOT NULL REFERENCES stock_inventories(id) ON DELETE CASCADE,
  stock_id       TEXT NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  sku            TEXT NOT NULL DEFAULT '',
  barcode        TEXT NOT NULL DEFAULT '',
  imei           TEXT NOT NULL DEFAULT '',
  unit           TEXT NOT NULL DEFAULT 'UN',
  cost           NUMERIC(12,2) NOT NULL DEFAULT 0,
  price          NUMERIC(12,2) NOT NULL DEFAULT 0,
  system_qty     NUMERIC(12,3) NOT NULL DEFAULT 0,
  counted_qty    NUMERIC(12,3),
  difference     NUMERIC(12,3) NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'ok', 'divergent_pos', 'divergent_neg'
  reconciled     BOOLEAN NOT NULL DEFAULT false,
  last_counted_at TIMESTAMPTZ,
  notes          TEXT NOT NULL DEFAULT '',
  CONSTRAINT uq_inventory_stock UNIQUE (inventory_id, stock_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_inv ON stock_inventory_items(inventory_id);
