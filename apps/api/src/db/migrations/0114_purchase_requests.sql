-- Solicitações de compra pelo catálogo digital (celular):
-- o cliente pede ao vendedor um produto/opção indisponível; a loja atende na fila,
-- lança entrada de estoque e conclui a venda pelos fluxos existentes.
CREATE TABLE IF NOT EXISTS purchase_requests (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  protocol TEXT NOT NULL,
  catalog_id TEXT REFERENCES sales_catalogs(id) ON DELETE SET NULL,
  request_key TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'fulfilled', 'cancelled')),
  customer_id TEXT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  phone_digits TEXT NOT NULL,
  product_id TEXT,
  product_name TEXT NOT NULL DEFAULT '',
  brand TEXT NOT NULL DEFAULT '',
  variant_label TEXT NOT NULL DEFAULT '',
  attributes JSONB NOT NULL DEFAULT '[]',
  qty INTEGER NOT NULL DEFAULT 1 CHECK (qty >= 1 AND qty <= 99),
  notes TEXT NOT NULL DEFAULT '',
  desired_options TEXT NOT NULL DEFAULT '',
  history JSONB NOT NULL DEFAULT '[]',
  stock_entry_id TEXT,
  sale_id TEXT,
  handled_by TEXT NOT NULL DEFAULT '',
  cancel_reason TEXT NOT NULL DEFAULT '',
  fulfilled_at TIMESTAMPTZ,
  fulfilled_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS purchase_requests_seq_uq ON purchase_requests (store_id, seq);
CREATE UNIQUE INDEX IF NOT EXISTS purchase_requests_protocol_uq ON purchase_requests (store_id, protocol);
CREATE UNIQUE INDEX IF NOT EXISTS purchase_requests_key_uq
  ON purchase_requests (store_id, request_key) WHERE request_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS purchase_requests_status_idx
  ON purchase_requests (store_id, status, created_at DESC);
