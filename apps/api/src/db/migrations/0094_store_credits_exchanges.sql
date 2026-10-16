-- Vale-compra e trocas do PDV no banco (antes ficavam só no navegador do caixa).
CREATE TABLE IF NOT EXISTS store_credits (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  remaining NUMERIC(12,2) NOT NULL CHECK (remaining >= 0),
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'used', 'cancelled')),
  order_id TEXT,
  session_id TEXT REFERENCES cash_sessions(id) ON DELETE SET NULL,
  operator_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, code)
);
CREATE INDEX IF NOT EXISTS idx_store_credits_store ON store_credits(store_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cash_exchanges (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL DEFAULT '',
  customer_name TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  return_lines JSONB NOT NULL DEFAULT '[]',
  out_lines JSONB NOT NULL DEFAULT '[]',
  return_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  out_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  cash_delta NUMERIC(12,2) NOT NULL DEFAULT 0,
  credit_id TEXT REFERENCES store_credits(id) ON DELETE SET NULL,
  session_id TEXT REFERENCES cash_sessions(id) ON DELETE SET NULL,
  note TEXT NOT NULL DEFAULT '',
  operator_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cash_exchanges_store ON cash_exchanges(store_id, created_at DESC);
