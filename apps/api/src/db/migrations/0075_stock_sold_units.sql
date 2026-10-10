-- Controle por IMEI: cada saída de aparelho do estoque fica registrada — venda (marcada pela venda,
-- pelo IMEI informado ou, sem IMEI, pela entrada mais antiga), bonificação, uso interno ou perda.
-- Cancelar a venda ou estornar a baixa não apaga o registro: marca reverted_at, e o aparelho volta a
-- "em estoque" mantendo o histórico do IMEI.
CREATE TABLE IF NOT EXISTS stock_sold_units (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  stock_item_id TEXT NOT NULL,
  variation_id TEXT,
  entry_id TEXT REFERENCES stock_supplier_entries(id) ON DELETE SET NULL,
  imei TEXT NOT NULL DEFAULT '',
  -- sale | bonus (bonificação) | internal (uso interno) | loss (perda/defeito)
  kind TEXT NOT NULL DEFAULT 'sale',
  sale_id TEXT,
  sale_line_id TEXT,
  unit_price NUMERIC(12,2),
  notes TEXT NOT NULL DEFAULT '',
  operator_name TEXT NOT NULL DEFAULT '',
  sold_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reverted_at TIMESTAMPTZ,
  reverted_reason TEXT NOT NULL DEFAULT '',
  reverted_by TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_stock_sold_units_item ON stock_sold_units(store_id, stock_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_sold_units_entry ON stock_sold_units(entry_id);
CREATE INDEX IF NOT EXISTS idx_stock_sold_units_sale ON stock_sold_units(store_id, sale_id);
CREATE INDEX IF NOT EXISTS idx_stock_sold_units_imei ON stock_sold_units(store_id, imei);
-- O mesmo IMEI não pode ter duas saídas ativas na loja.
CREATE UNIQUE INDEX IF NOT EXISTS stock_sold_units_active_imei ON stock_sold_units(store_id, imei) WHERE imei <> '' AND reverted_at IS NULL;

-- Compra lançada no financeiro (contas a pagar) a partir da entrada do fornecedor.
ALTER TABLE stock_supplier_entries ADD COLUMN IF NOT EXISTS payable_id TEXT;
