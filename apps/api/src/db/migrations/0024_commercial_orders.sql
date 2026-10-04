ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS product_name TEXT NOT NULL DEFAULT '';
ALTER TABLE sales_orders ALTER COLUMN seller_id DROP NOT NULL;
ALTER TABLE sales_orders ALTER COLUMN seller_id SET DEFAULT NULL;
ALTER TABLE receivables ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE payables ALTER COLUMN updated_at SET DEFAULT now();
-- Production uses canonical Prisma columns alongside the Express compatibility fields.
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS payment TEXT NOT NULL DEFAULT '';
ALTER TABLE receivables ADD COLUMN IF NOT EXISTS sale_id TEXT REFERENCES sales_orders(id);
ALTER TABLE sale_payments ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'other';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bank_accounts' AND column_name='current_balance') THEN
    ALTER TABLE bank_accounts ADD COLUMN current_balance NUMERIC(12,2) NOT NULL DEFAULT 0;
    UPDATE bank_accounts a SET current_balance=a.initial_balance+COALESCE((SELECT SUM(CASE WHEN e.type::text='in' THEN e.amount ELSE -e.amount END) FROM finance_entries e WHERE e.account_id=a.id AND e.store_id=a.store_id),0);
  END IF;
END $$;
CREATE OR REPLACE FUNCTION marthi_sync_sale_columns() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sale_type='external' THEN
    NEW.total:=NEW.subtotal;
    NEW.final_amount:=NEW.total_amount;
    NEW.amount:=NEW.total_amount;
    NEW.payment:=NEW.payment_name;
    IF NEW.source<>'commercial' THEN NEW.source:='external'; END IF;
  END IF;
  RETURN NEW;
END $$;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS segment TEXT NOT NULL DEFAULT '';
-- Optional commercial policies and real supplier/order data, isolated by store.
CREATE TABLE IF NOT EXISTS commercial_store_customization (
  store_id TEXT PRIMARY KEY REFERENCES stores(id), settings JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS commercial_profiles (
  store_id TEXT PRIMARY KEY REFERENCES stores(id),
  segment_id TEXT NOT NULL,
  settings JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS commercial_offers (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  variant_key TEXT NOT NULL,
  details JSONB NOT NULL,
  source_at TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_commercial_offers_variant ON commercial_offers(store_id, variant_key, source_at DESC);
CREATE TABLE IF NOT EXISTS commercial_orders (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'quoted' CHECK(status IN ('quoted','confirmed','purchased','in_transit','received','delivered','cancelled')),
  details JSONB NOT NULL,
  sale_id TEXT REFERENCES sales_orders(id),
  receivable_id TEXT REFERENCES receivables(id),
  payable_id TEXT REFERENCES payables(id),
  request_key TEXT NOT NULL,
  stock_id TEXT GENERATED ALWAYS AS (details->>'stockId') STORED REFERENCES stock_items(id),
  used_stock_id TEXT GENERATED ALWAYS AS (details->>'usedStockId') STORED REFERENCES stock_items(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id, request_key)
);
CREATE INDEX IF NOT EXISTS idx_commercial_orders_store ON commercial_orders(store_id, status);
CREATE TABLE IF NOT EXISTS commercial_order_payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES commercial_orders(id),
  store_id TEXT NOT NULL REFERENCES stores(id),
  account_id TEXT NOT NULL REFERENCES bank_accounts(id),
  kind TEXT NOT NULL CHECK(kind IN ('payment','refund')),
  amount NUMERIC(12,2) NOT NULL CHECK(amount > 0),
  method TEXT NOT NULL,
  request_key TEXT NOT NULL,
  finance_entry_id TEXT NOT NULL REFERENCES finance_entries(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id, request_key)
);
CREATE TABLE IF NOT EXISTS commercial_order_events (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  order_id TEXT NOT NULL REFERENCES commercial_orders(id),
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Enforce tenant ownership in PostgreSQL as well as in the API.
DROP TRIGGER IF EXISTS marthi_guard_commercial_offer ON commercial_offers;
CREATE TRIGGER marthi_guard_commercial_offer BEFORE INSERT OR UPDATE ON commercial_offers FOR EACH ROW EXECUTE FUNCTION marthi_guard_store_references('supplier_id','suppliers');
DROP TRIGGER IF EXISTS marthi_guard_commercial_order ON commercial_orders;
CREATE TRIGGER marthi_guard_commercial_order BEFORE INSERT OR UPDATE ON commercial_orders FOR EACH ROW EXECUTE FUNCTION marthi_guard_store_references('customer_id','customers','sale_id','sales_orders','receivable_id','receivables','payable_id','payables');
DROP TRIGGER IF EXISTS marthi_guard_commercial_payment ON commercial_order_payments;
CREATE TRIGGER marthi_guard_commercial_payment BEFORE INSERT OR UPDATE ON commercial_order_payments FOR EACH ROW EXECUTE FUNCTION marthi_guard_store_references('order_id','commercial_orders','account_id','bank_accounts','finance_entry_id','finance_entries');
DROP TRIGGER IF EXISTS marthi_guard_commercial_event ON commercial_order_events;
CREATE TRIGGER marthi_guard_commercial_event BEFORE INSERT OR UPDATE ON commercial_order_events FOR EACH ROW EXECUTE FUNCTION marthi_guard_store_references('order_id','commercial_orders');
