-- Correções de vendas já concluídas: quem alterou, quando, por quê e a venda completa antes e depois.
CREATE TABLE IF NOT EXISTS sale_revisions (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  sale_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  operator_name TEXT NOT NULL DEFAULT '',
  before JSONB NOT NULL,
  after JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sale_revisions_sale ON sale_revisions(store_id, sale_id, created_at DESC);
