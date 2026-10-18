-- Assinaturas e faturas da plataforma Marthi (cobrança recorrente SaaS).
-- Fonte de verdade no MarthiDB; provedor externo (Stripe/PIX) só via env + colunas provider_*.

CREATE TABLE IF NOT EXISTS client_subscriptions (
  id TEXT PRIMARY KEY,
  client_account_id TEXT NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  store_id TEXT REFERENCES stores(id) ON DELETE SET NULL,
  plan_id TEXT NOT NULL DEFAULT 'bronze',
  modules TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'incomplete', 'unpaid')),
  billing_cycle TEXT NOT NULL DEFAULT 'monthly'
    CHECK (billing_cycle IN ('monthly', 'yearly')),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  next_charge_at TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  canceled_at TIMESTAMPTZ,
  provider TEXT NOT NULL DEFAULT 'manual'
    CHECK (provider IN ('manual', 'stripe', 'asaas', 'mercadopago')),
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  payment_method_preference TEXT NOT NULL DEFAULT 'pix'
    CHECK (payment_method_preference IN ('pix', 'card', 'boleto', 'mixed')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_client_subscriptions_account UNIQUE (client_account_id)
);

CREATE INDEX IF NOT EXISTS idx_client_subscriptions_status ON client_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_client_subscriptions_next_charge ON client_subscriptions(next_charge_at);
CREATE INDEX IF NOT EXISTS idx_client_subscriptions_provider ON client_subscriptions(provider);

CREATE TABLE IF NOT EXISTS billing_invoices (
  id TEXT PRIMARY KEY,
  client_account_id TEXT NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  subscription_id TEXT REFERENCES client_subscriptions(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),
  description TEXT NOT NULL DEFAULT '',
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  payment_method TEXT,
  provider TEXT NOT NULL DEFAULT 'manual'
    CHECK (provider IN ('manual', 'stripe', 'asaas', 'mercadopago')),
  provider_invoice_id TEXT,
  transaction_ref TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_account ON billing_invoices(client_account_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_status ON billing_invoices(status);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_due ON billing_invoices(due_at);

CREATE TABLE IF NOT EXISTS billing_payment_events (
  id TEXT PRIMARY KEY,
  client_account_id TEXT REFERENCES client_accounts(id) ON DELETE SET NULL,
  subscription_id TEXT REFERENCES client_subscriptions(id) ON DELETE SET NULL,
  invoice_id TEXT REFERENCES billing_invoices(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'manual',
  provider_event_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_payment_events_account ON billing_payment_events(client_account_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_payment_events_provider
  ON billing_payment_events(provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;
