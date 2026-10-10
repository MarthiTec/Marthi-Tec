-- Unidades vendidas: cada venda marca qual aparelho saiu do estoque (pelo IMEI informado ou, sem IMEI,
-- pela entrada mais antiga ainda com saldo). Cancelar a venda apaga a marca e o aparelho volta a
-- "em estoque". Assim cada IMEI das entradas mostra se foi vendido ou não.
CREATE TABLE IF NOT EXISTS stock_sold_units (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  stock_item_id TEXT NOT NULL,
  variation_id TEXT,
  entry_id TEXT REFERENCES stock_supplier_entries(id) ON DELETE SET NULL,
  imei TEXT NOT NULL DEFAULT '',
  sale_id TEXT NOT NULL,
  sale_line_id TEXT,
  sold_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_sold_units_item ON stock_sold_units(store_id, stock_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_sold_units_entry ON stock_sold_units(entry_id);
CREATE INDEX IF NOT EXISTS idx_stock_sold_units_sale ON stock_sold_units(store_id, sale_id);
-- O mesmo IMEI não pode estar vendido duas vezes na loja.
CREATE UNIQUE INDEX IF NOT EXISTS stock_sold_units_imei ON stock_sold_units(store_id, imei) WHERE imei <> '';
