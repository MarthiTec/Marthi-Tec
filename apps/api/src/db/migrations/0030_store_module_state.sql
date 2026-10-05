CREATE TABLE IF NOT EXISTS store_module_state (
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  data JSONB NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(store_id, module_key)
);
