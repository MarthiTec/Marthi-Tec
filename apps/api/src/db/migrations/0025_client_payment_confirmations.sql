CREATE TABLE IF NOT EXISTS client_payment_confirmations (
  client_account_id TEXT PRIMARY KEY REFERENCES client_accounts(id),
  store_id TEXT NOT NULL REFERENCES stores(id),
  payment_method TEXT NOT NULL,
  transaction_ref TEXT,
  notes TEXT NOT NULL DEFAULT '',
  confirmed_by TEXT NOT NULL REFERENCES users(id),
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  contracting_status TEXT NOT NULL CHECK (contracting_status IN ('acesso_pendente','acesso_ativado'))
);
