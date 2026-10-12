-- Tesouraria e adiantamentos no mesmo formato do banco de produção (lá as tabelas já existem assim).
-- Tesouraria: data do movimento em "at"; depósito e saque usam só uma das contas.
ALTER TABLE treasury_moves ADD COLUMN IF NOT EXISTS at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE treasury_moves ALTER COLUMN from_account_id DROP NOT NULL;
ALTER TABLE treasury_moves ALTER COLUMN to_account_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_treasury_moves_store ON treasury_moves(store_id, at DESC);

-- Adiantamentos de clientes (recebidos) e a fornecedores (pagos), abatidos depois em vendas ou contas.
CREATE TABLE IF NOT EXISTS advance_payments (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('customer', 'supplier')),
  party_name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  used_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  account_id TEXT REFERENCES bank_accounts(id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_advance_payments_store ON advance_payments(store_id, created_at DESC);
