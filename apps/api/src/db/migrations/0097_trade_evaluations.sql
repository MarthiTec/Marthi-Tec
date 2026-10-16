-- Avaliação interna do aparelho de troca: o vendedor pede, a oficina avalia (sem custo para o cliente)
-- e o vendedor aprova ou recusa o preço sugerido. Não é OS: não gera orçamento nem financeiro.
CREATE TABLE IF NOT EXISTS trade_evaluations (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'evaluated', 'approved', 'rejected', 'canceled')),
  customer_id TEXT,
  customer_name TEXT NOT NULL DEFAULT '',
  device_name TEXT NOT NULL DEFAULT '',
  imei TEXT NOT NULL DEFAULT '',
  capacity TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  request_notes TEXT NOT NULL DEFAULT '',
  requested_by TEXT NOT NULL DEFAULT '',
  requested_by_email TEXT NOT NULL DEFAULT '',
  battery_level INTEGER CHECK (battery_level BETWEEN 0 AND 100),
  opened BOOLEAN,
  cracked BOOLEAN,
  evaluation_notes TEXT NOT NULL DEFAULT '',
  suggested_price NUMERIC(12,2),
  evaluated_by TEXT NOT NULL DEFAULT '',
  evaluated_at TIMESTAMPTZ,
  approved_price NUMERIC(12,2),
  decision_notes TEXT NOT NULL DEFAULT '',
  decided_by TEXT NOT NULL DEFAULT '',
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trade_evaluations_store_status ON trade_evaluations(store_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_evaluations_store_imei ON trade_evaluations(store_id, imei);
