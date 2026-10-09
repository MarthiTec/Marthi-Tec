-- Entradas do mesmo produto por fornecedor: cada compra tem fornecedor, data, quantidade, custo e
-- IMEIs próprios. O preço de venda continua sendo o da variação (cor/capacidade) e do tipo de retirada.
CREATE TABLE IF NOT EXISTS stock_supplier_entries (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  stock_item_id TEXT NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  -- Variação da grade (cor/capacidade); vazio = produto simples.
  variation_id TEXT,
  supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  qty INT NOT NULL CHECK (qty > 0),
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  imeis JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_supplier_entries_item ON stock_supplier_entries(store_id, stock_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_supplier_entries_supplier ON stock_supplier_entries(store_id, supplier_id);
