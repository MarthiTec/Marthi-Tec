-- Aparelhos compatíveis com a peça (além das qualidades do catálogo de manutenções): a mesma tela ou
-- bateria pode servir em vários aparelhos, mesmo sem serviço cadastrado para eles.
CREATE TABLE IF NOT EXISTS repair_part_devices (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  stock_item_id TEXT NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  brand TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS repair_part_devices_unique ON repair_part_devices (store_id, stock_item_id, lower(brand), lower(model));
CREATE INDEX IF NOT EXISTS repair_part_devices_model_idx ON repair_part_devices (store_id, lower(model));
