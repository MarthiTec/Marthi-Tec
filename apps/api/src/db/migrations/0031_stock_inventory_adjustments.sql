CREATE TABLE IF NOT EXISTS stock_inventory_adjustments (
  store_id TEXT NOT NULL REFERENCES stores(id),
  balance_id TEXT NOT NULL,
  result JSONB NOT NULL,
  applied_by TEXT NOT NULL REFERENCES users(id),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(store_id,balance_id)
);
