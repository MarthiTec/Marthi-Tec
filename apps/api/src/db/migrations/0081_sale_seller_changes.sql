-- Troca do vendedor de uma venda já concluída (metas e comissões passam para o vendedor certo),
-- com histórico de quem trocou e quando.
CREATE TABLE IF NOT EXISTS sale_seller_changes (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  sale_id TEXT NOT NULL,
  from_seller_id TEXT,
  from_seller_name TEXT NOT NULL DEFAULT '',
  to_seller_id TEXT NOT NULL,
  to_seller_name TEXT NOT NULL DEFAULT '',
  changed_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sale_seller_changes_sale ON sale_seller_changes(store_id, sale_id, created_at DESC);
