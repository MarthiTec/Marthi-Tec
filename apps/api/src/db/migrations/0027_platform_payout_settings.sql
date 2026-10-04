CREATE TABLE IF NOT EXISTS platform_payout_settings (
  id TEXT PRIMARY KEY CHECK (id = 'platform'),
  bank_account JSONB NOT NULL DEFAULT '{}'::jsonb,
  pix JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by TEXT NOT NULL REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
