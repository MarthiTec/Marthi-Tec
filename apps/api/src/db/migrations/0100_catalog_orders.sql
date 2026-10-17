-- Pedido feito pelo cliente no catálogo (celular): cadastro do cliente, produtos, aparelho de troca e
-- preferência de pagamento. Cai na fila da venda externa; a loja aprova o cadastro e finaliza a venda.
-- kind 'signup' = só o cadastro do cliente (sem produto).
CREATE TABLE IF NOT EXISTS catalog_orders (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  catalog_id TEXT REFERENCES sales_catalogs(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'order' CHECK (kind IN ('order', 'signup')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_service', 'sold', 'cancelled')),
  customer JSONB NOT NULL DEFAULT '{}',
  customer_id TEXT,
  -- Vendedor que o cliente disse que o atendeu (meta e comissão).
  seller_id TEXT,
  items JSONB NOT NULL DEFAULT '[]',
  trade_in JSONB,
  payment TEXT NOT NULL DEFAULT '',
  installments INTEGER NOT NULL DEFAULT 1,
  fulfillment TEXT NOT NULL DEFAULT 'store',
  notes TEXT NOT NULL DEFAULT '',
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  sale_id TEXT,
  handled_by TEXT NOT NULL DEFAULT '',
  cancel_reason TEXT NOT NULL DEFAULT '',
  request_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_catalog_orders_store ON catalog_orders(store_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_orders_request ON catalog_orders(store_id, request_key) WHERE request_key IS NOT NULL;
