-- Encomenda de peça para a OS: a peça não tem no estoque da oficina, a loja pede ao fornecedor com
-- prazo combinado; o aparelho fica na loja ou o cliente traz quando a peça chegar.
CREATE TABLE IF NOT EXISTS repair_part_orders (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  work_order_id TEXT,
  stock_item_id TEXT REFERENCES stock_items(id) ON DELETE SET NULL,
  description TEXT NOT NULL DEFAULT '',
  qty INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
  unit_cost NUMERIC(12,2),
  supplier_id TEXT,
  supplier_name TEXT NOT NULL DEFAULT '',
  expected_at DATE,
  device_at_store BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'ordered' CHECK (status IN ('ordered', 'arrived', 'cancelled')),
  notes TEXT NOT NULL DEFAULT '',
  entry_id TEXT,
  created_by TEXT NOT NULL DEFAULT '',
  arrived_at TIMESTAMPTZ,
  arrived_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS repair_part_orders_store_idx ON repair_part_orders (store_id, status, expected_at);
CREATE INDEX IF NOT EXISTS repair_part_orders_os_idx ON repair_part_orders (store_id, work_order_id);
