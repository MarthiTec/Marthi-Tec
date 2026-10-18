-- [0020_security_persistence.sql]
-- OTP state must survive restarts and enforce limits across all application instances.
CREATE TABLE IF NOT EXISTS phone_otps (
  phone TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  send_count INTEGER NOT NULL DEFAULT 1,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ
);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS smtp_settings JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;

-- [0021_external_sales_store_integrity.sql]
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS track_lot BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS is_kit BOOLEAN NOT NULL DEFAULT false;
-- Compatibility for external sales, keeping the canonical POS columns populated.
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS total NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS final_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'pos';
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS local_id TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS customer_document TEXT NOT NULL DEFAULT '';
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS seller_name TEXT NOT NULL DEFAULT '';
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS operator_name TEXT NOT NULL DEFAULT '';
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS surcharge NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS payment_name TEXT NOT NULL DEFAULT '';
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE sales_order_lines ADD COLUMN IF NOT EXISTS order_id TEXT REFERENCES sales_orders(id);
ALTER TABLE sales_order_lines ADD COLUMN IF NOT EXISTS stock_item_id TEXT REFERENCES stock_items(id);
ALTER TABLE sales_order_lines ADD COLUMN IF NOT EXISTS total_price NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE sales_order_lines ADD COLUMN IF NOT EXISTS stock_id TEXT REFERENCES stock_items(id);
ALTER TABLE sales_order_lines ADD COLUMN IF NOT EXISTS imei TEXT NOT NULL DEFAULT '';
ALTER TABLE sales_order_lines ADD COLUMN IF NOT EXISTS is_ad_hoc BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sales_order_lines ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'product';
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS stock_id TEXT REFERENCES stock_items(id);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS stock_item_id TEXT REFERENCES stock_items(id);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS cost NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS reason TEXT NOT NULL DEFAULT '';
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS previous_qty INT;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS new_qty INT;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS ref_type TEXT NOT NULL DEFAULT '';
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS operator_name TEXT NOT NULL DEFAULT '';
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
ALTER TABLE sale_payments ADD COLUMN IF NOT EXISTS method_name TEXT NOT NULL DEFAULT '';
ALTER TABLE sale_payments ADD COLUMN IF NOT EXISTS method TEXT NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION marthi_sync_sale_columns() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sale_type = 'external' THEN
    NEW.total := NEW.subtotal;
    NEW.final_amount := NEW.total_amount;
    NEW.source := 'external';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS marthi_sync_sale_columns ON sales_orders;
CREATE TRIGGER marthi_sync_sale_columns BEFORE INSERT OR UPDATE ON sales_orders
FOR EACH ROW EXECUTE FUNCTION marthi_sync_sale_columns();

CREATE OR REPLACE FUNCTION marthi_guard_sale_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sale_store TEXT; item_store TEXT;
BEGIN
  NEW.sale_id := COALESCE(NEW.sale_id, NEW.order_id);
  NEW.order_id := COALESCE(NEW.order_id, NEW.sale_id);
  NEW.stock_item_id := COALESCE(NEW.stock_item_id, NEW.stock_id);
  NEW.stock_id := COALESCE(NEW.stock_id, NEW.stock_item_id);
  IF NEW.sale_id IS DISTINCT FROM NEW.order_id OR NEW.stock_id IS DISTINCT FROM NEW.stock_item_id THEN
    RAISE EXCEPTION 'Inconsistent sale references' USING ERRCODE = '23514';
  END IF;
  SELECT store_id INTO sale_store FROM sales_orders WHERE id = NEW.sale_id;
  IF NEW.stock_item_id IS NOT NULL THEN
    SELECT store_id INTO item_store FROM stock_items WHERE id = NEW.stock_item_id;
    IF sale_store IS DISTINCT FROM item_store THEN
      RAISE EXCEPTION 'Stock belongs to another store' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS marthi_guard_sale_line ON sales_order_lines;
CREATE TRIGGER marthi_guard_sale_line BEFORE INSERT OR UPDATE ON sales_order_lines
FOR EACH ROW EXECUTE FUNCTION marthi_guard_sale_line();

CREATE OR REPLACE FUNCTION marthi_guard_movement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item_store TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.stock_item_id IS NULL AND NEW.stock_id IS NOT NULL THEN
      NEW.cost := NEW.unit_cost;
      NEW.reason := NEW.notes;
    ELSE
      NEW.unit_cost := NEW.cost;
      NEW.notes := NEW.reason;
    END IF;
  END IF;
  NEW.stock_item_id := COALESCE(NEW.stock_item_id, NEW.stock_id);
  NEW.stock_id := COALESCE(NEW.stock_id, NEW.stock_item_id);
  SELECT store_id INTO item_store FROM stock_items WHERE id = NEW.stock_item_id;
  IF NEW.stock_id IS DISTINCT FROM NEW.stock_item_id OR NEW.store_id IS DISTINCT FROM item_store THEN
    RAISE EXCEPTION 'Stock movement belongs to another store' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS marthi_guard_movement ON stock_movements;
CREATE TRIGGER marthi_guard_movement BEFORE INSERT OR UPDATE ON stock_movements
FOR EACH ROW EXECUTE FUNCTION marthi_guard_movement();

-- All references listed by each trigger must belong to the record's store.
CREATE OR REPLACE FUNCTION marthi_guard_store_references() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE idx INT; reference_id TEXT; reference_store TEXT;
BEGIN
  FOR idx IN 0..TG_NARGS-1 BY 2 LOOP
    reference_id := to_jsonb(NEW)->>TG_ARGV[idx];
    IF reference_id IS NOT NULL THEN
      EXECUTE format('SELECT store_id FROM %I WHERE id = $1', TG_ARGV[idx+1]) INTO reference_store USING reference_id;
      IF reference_store IS DISTINCT FROM NEW.store_id THEN
        RAISE EXCEPTION 'Related record belongs to another store' USING ERRCODE = '23514';
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS marthi_guard_order ON sales_orders;
CREATE TRIGGER marthi_guard_order BEFORE INSERT OR UPDATE ON sales_orders FOR EACH ROW
EXECUTE FUNCTION marthi_guard_store_references('customer_id','customers','seller_id','sellers','session_id','cash_sessions');
DROP TRIGGER IF EXISTS marthi_guard_stock ON stock_items;
CREATE TRIGGER marthi_guard_stock BEFORE INSERT OR UPDATE ON stock_items FOR EACH ROW
EXECUTE FUNCTION marthi_guard_store_references('supplier_id','suppliers');
DROP TRIGGER IF EXISTS marthi_guard_receivable ON receivables;
CREATE TRIGGER marthi_guard_receivable BEFORE INSERT OR UPDATE ON receivables FOR EACH ROW
EXECUTE FUNCTION marthi_guard_store_references('customer_id','customers','sale_id','sales_orders');
DROP TRIGGER IF EXISTS marthi_guard_trade_in ON sale_trade_ins;
CREATE TRIGGER marthi_guard_trade_in BEFORE INSERT OR UPDATE ON sale_trade_ins FOR EACH ROW
EXECUTE FUNCTION marthi_guard_store_references('sale_id','sales_orders','stock_item_id','stock_items','customer_id','customers','received_by_seller_id','sellers');
DROP TRIGGER IF EXISTS marthi_guard_goal ON sales_goals;
CREATE TRIGGER marthi_guard_goal BEFORE INSERT OR UPDATE ON sales_goals FOR EACH ROW
EXECUTE FUNCTION marthi_guard_store_references('seller_id','sellers');

CREATE OR REPLACE FUNCTION marthi_guard_user_store() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE user_tenant TEXT; store_tenant TEXT;
BEGIN
  SELECT client_account_id INTO user_tenant FROM users WHERE id = NEW.user_id;
  SELECT client_account_id INTO store_tenant FROM stores WHERE id = NEW.store_id;
  IF user_tenant IS NULL OR user_tenant IS DISTINCT FROM store_tenant THEN
    RAISE EXCEPTION 'User and store belong to different accounts' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS marthi_guard_user_store ON user_stores;
CREATE TRIGGER marthi_guard_user_store BEFORE INSERT OR UPDATE ON user_stores FOR EACH ROW
EXECUTE FUNCTION marthi_guard_user_store();
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS request_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_order_request ON sales_orders(store_id,request_key) WHERE request_key IS NOT NULL;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS whatsapp_settings JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE stores ALTER COLUMN email SET DEFAULT '';
ALTER TABLE stores ALTER COLUMN phone SET DEFAULT '';
DROP TRIGGER IF EXISTS marthi_guard_employee ON employees;
CREATE TRIGGER marthi_guard_employee BEFORE INSERT OR UPDATE ON employees FOR EACH ROW
EXECUTE FUNCTION marthi_guard_store_references('seller_id','sellers');

ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';

ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS cancel_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS cancel_operator TEXT NOT NULL DEFAULT '';

DROP TRIGGER IF EXISTS marthi_guard_stock_items ON stock_items;
CREATE TRIGGER marthi_guard_stock_items BEFORE INSERT OR UPDATE ON stock_items FOR EACH ROW EXECUTE FUNCTION marthi_guard_store_references('supplier_id','suppliers','product_id','products');

DROP TRIGGER IF EXISTS marthi_guard_receivables ON receivables;
CREATE TRIGGER marthi_guard_receivables BEFORE INSERT OR UPDATE ON receivables FOR EACH ROW EXECUTE FUNCTION marthi_guard_store_references('customer_id','customers','sale_id','sales_orders','account_id','bank_accounts','quote_id','pos_quotes','os_id','work_orders');

DROP TRIGGER IF EXISTS marthi_guard_payables ON payables;
CREATE TRIGGER marthi_guard_payables BEFORE INSERT OR UPDATE ON payables FOR EACH ROW EXECUTE FUNCTION marthi_guard_store_references('supplier_id','suppliers','account_id','bank_accounts');

DROP TRIGGER IF EXISTS marthi_guard_finance_entries ON finance_entries;
CREATE TRIGGER marthi_guard_finance_entries BEFORE INSERT OR UPDATE ON finance_entries FOR EACH ROW EXECUTE FUNCTION marthi_guard_store_references('account_id','bank_accounts');

DROP TRIGGER IF EXISTS marthi_guard_treasury_moves ON treasury_moves;
CREATE TRIGGER marthi_guard_treasury_moves BEFORE INSERT OR UPDATE ON treasury_moves FOR EACH ROW EXECUTE FUNCTION marthi_guard_store_references('from_account_id','bank_accounts','to_account_id','bank_accounts');

DROP TRIGGER IF EXISTS marthi_guard_payment_methods ON payment_methods;
CREATE TRIGGER marthi_guard_payment_methods BEFORE INSERT OR UPDATE ON payment_methods FOR EACH ROW EXECUTE FUNCTION marthi_guard_store_references('price_table_id','price_tables');

DROP TRIGGER IF EXISTS marthi_guard_pos_quotes ON pos_quotes;
CREATE TRIGGER marthi_guard_pos_quotes BEFORE INSERT OR UPDATE ON pos_quotes FOR EACH ROW EXECUTE FUNCTION marthi_guard_store_references('customer_id','customers');

DROP TRIGGER IF EXISTS marthi_guard_work_orders ON work_orders;
CREATE TRIGGER marthi_guard_work_orders BEFORE INSERT OR UPDATE ON work_orders FOR EACH ROW EXECUTE FUNCTION marthi_guard_store_references('customer_id','customers');

DROP TRIGGER IF EXISTS marthi_guard_cash_pickups ON cash_pickups;
CREATE TRIGGER marthi_guard_cash_pickups BEFORE INSERT OR UPDATE ON cash_pickups FOR EACH ROW EXECUTE FUNCTION marthi_guard_store_references('finance_entry_id','finance_entries');

CREATE OR REPLACE FUNCTION marthi_guard_store_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.store_id IS DISTINCT FROM OLD.store_id THEN
  RAISE EXCEPTION 'Records cannot be reassigned to another store' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE target RECORD; BEGIN
 FOR target IN SELECT c.table_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name WHERE c.table_schema = 'public' AND c.column_name = 'store_id' AND c.table_name <> 'users' AND t.table_type='BASE TABLE' LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS marthi_guard_store_owner ON %I', target.table_name);
  EXECUTE format('CREATE TRIGGER marthi_guard_store_owner BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION marthi_guard_store_owner()', target.table_name);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION marthi_guard_account_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.client_account_id IS DISTINCT FROM OLD.client_account_id THEN
  RAISE EXCEPTION 'Account ownership cannot be reassigned' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS marthi_guard_account_owner ON users;
CREATE TRIGGER marthi_guard_account_owner BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION marthi_guard_account_owner();
DROP TRIGGER IF EXISTS marthi_guard_account_owner ON stores;
CREATE TRIGGER marthi_guard_account_owner BEFORE UPDATE ON stores FOR EACH ROW EXECUTE FUNCTION marthi_guard_account_owner();

-- [0022_cash_sessions_integrity.sql]
-- Fields used by the cash API, preserving canonical session/event fields.
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS terminal_id TEXT REFERENCES pos_terminals(id);
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS operator_id TEXT REFERENCES users(id);
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS initial_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS closed_amount NUMERIC(12,2);
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS operator_name TEXT NOT NULL DEFAULT '';
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS opening_float NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS expected_cash NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS counted_cash NUMERIC(12,2);
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS difference NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS reopen_count INT NOT NULL DEFAULT 0;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS closing_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
ALTER TABLE cash_session_events ADD COLUMN IF NOT EXISTS store_id TEXT REFERENCES stores(id);
ALTER TABLE cash_session_events ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE cash_session_events ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
ALTER TABLE cash_session_events ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE cash_session_events ADD COLUMN IF NOT EXISTS cash_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE cash_session_events ADD COLUMN IF NOT EXISTS note TEXT NOT NULL DEFAULT '';
ALTER TABLE cash_session_events ADD COLUMN IF NOT EXISTS reason TEXT NOT NULL DEFAULT '';
ALTER TABLE cash_session_events ADD COLUMN IF NOT EXISTS beneficiary_type TEXT;
ALTER TABLE cash_session_events ADD COLUMN IF NOT EXISTS beneficiary_name TEXT NOT NULL DEFAULT '';
ALTER TABLE cash_session_events ADD COLUMN IF NOT EXISTS operator_name TEXT NOT NULL DEFAULT '';
ALTER TABLE cash_session_events ADD COLUMN IF NOT EXISTS order_id TEXT REFERENCES sales_orders(id);
UPDATE cash_session_events e SET store_id = s.store_id FROM cash_sessions s WHERE e.session_id = s.id AND e.store_id IS NULL;
CREATE OR REPLACE FUNCTION marthi_sync_cash_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE session_store TEXT;
BEGIN
 SELECT store_id INTO session_store FROM cash_sessions WHERE id = NEW.session_id;
 NEW.store_id := COALESCE(NEW.store_id, session_store);
 IF NEW.store_id IS DISTINCT FROM session_store THEN RAISE EXCEPTION 'Cash session belongs to another store' USING ERRCODE='23514'; END IF;
 NEW.event_type := COALESCE(NEW.type,NEW.event_type);
 NEW.type := COALESCE(NEW.type,NEW.event_type);
 IF NEW.type IS DISTINCT FROM NEW.event_type THEN RAISE EXCEPTION 'Inconsistent cash event type' USING ERRCODE='23514'; END IF;
 NEW.notes := COALESCE(NULLIF(NEW.note,''),NEW.notes);
 RETURN NEW;
END $$;
CREATE TRIGGER marthi_sync_cash_event BEFORE INSERT OR UPDATE ON cash_session_events FOR EACH ROW EXECUTE FUNCTION marthi_sync_cash_event();
CREATE TRIGGER marthi_guard_cash_event BEFORE INSERT OR UPDATE ON cash_session_events FOR EACH ROW EXECUTE FUNCTION marthi_guard_store_references('session_id','cash_sessions','order_id','sales_orders');
CREATE OR REPLACE FUNCTION marthi_sync_cash_session() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW.initial_amount := NEW.opening_float;
 NEW.closed_amount := NEW.counted_cash;
 RETURN NEW;
END $$;
CREATE TRIGGER marthi_sync_cash_session BEFORE INSERT OR UPDATE ON cash_sessions FOR EACH ROW EXECUTE FUNCTION marthi_sync_cash_session();
ALTER TABLE pos_tickets ADD COLUMN IF NOT EXISTS code INT;
ALTER TABLE pos_tickets ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'totem';
ALTER TABLE pos_tickets ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';

-- [0023_communication_delivery.sql]
CREATE TABLE IF NOT EXISTS communication_delivery_logs (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  recipient TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'failed', 'unknown')),
  provider_message_id TEXT,
  provider_status INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS communication_delivery_store_idx ON communication_delivery_logs(store_id, created_at DESC);

-- [0024_commercial_orders.sql]
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

-- [0025_client_payment_confirmations.sql]
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

-- [0026_operator_profiles.sql]
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_phone TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_address TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS panel_theme TEXT NOT NULL DEFAULT 'light';

-- [0027_platform_payout_settings.sql]
CREATE TABLE IF NOT EXISTS platform_payout_settings (
  id TEXT PRIMARY KEY CHECK (id = 'platform'),
  bank_account JSONB NOT NULL DEFAULT '{}'::jsonb,
  pix JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by TEXT NOT NULL REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- [0028_promo_campaign_rules.sql]
ALTER TABLE promo_campaigns ADD COLUMN IF NOT EXISTS rules JSONB NOT NULL DEFAULT '{}'::jsonb;

-- [0029_commercial_plans_catalog.sql]
CREATE TABLE IF NOT EXISTS platform_commercial_plans (
 id TEXT PRIMARY KEY, settings JSONB NOT NULL, defaults JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Migra o catálogo comercial existente para configurações editáveis no banco.
INSERT INTO platform_commercial_plans(id, settings, defaults) VALUES ('bronze','{"id":"bronze","name":"Bronze","price":"R$ 197","priceNumeric":197,"period":"/mês","blurb":"1 módulo à escolha + painel da loja com orçamentos básicos. Ideal para começar enxuto.","fullDescription":"Plano inicial para empresas e lojas que precisam de uma operação ágil e focada em um módulo essencial (Totem & Cardápio Digital, OS, PDV + Retaguarda, Fiscal ou E-commerce), mantendo controle total no painel web.","commercialCallout":"Ideal para começar enxuto","homeSummary":"1 módulo à sua escolha com painel completo da loja, orçamentos e perfil de operador.","featured":false,"displayOrder":1,"active":true,"maxModules":1,"features":["1 módulo à escolha (Totem & Cardápio Digital, OS, PDV + Retaguarda, Fiscal ou E-commerce)","Painel web da loja com perfil de operador e gestão central","Orçamentos comerciais e emissão de propostas básicas","Central com casinha em cada app (mesma experiência integrada)","1 unidade / operação enxuta com retaguarda leve","Suporte em horário comercial e atualizações contínuas"]}'::jsonb,'{"id":"bronze","name":"Bronze","price":"R$ 197","priceNumeric":197,"period":"/mês","blurb":"1 módulo à escolha + painel da loja com orçamentos básicos. Ideal para começar enxuto.","fullDescription":"Plano inicial para empresas e lojas que precisam de uma operação ágil e focada em um módulo essencial (Totem & Cardápio Digital, OS, PDV + Retaguarda, Fiscal ou E-commerce), mantendo controle total no painel web.","commercialCallout":"Ideal para começar enxuto","homeSummary":"1 módulo à sua escolha com painel completo da loja, orçamentos e perfil de operador.","featured":false,"displayOrder":1,"active":true,"maxModules":1,"features":["1 módulo à escolha (Totem & Cardápio Digital, OS, PDV + Retaguarda, Fiscal ou E-commerce)","Painel web da loja com perfil de operador e gestão central","Orçamentos comerciais e emissão de propostas básicas","Central com casinha em cada app (mesma experiência integrada)","1 unidade / operação enxuta com retaguarda leve","Suporte em horário comercial e atualizações contínuas"]}'::jsonb) ON CONFLICT (id) DO NOTHING;
INSERT INTO platform_commercial_plans(id, settings, defaults) VALUES ('silver','{"id":"silver","name":"Silver","price":"R$ 497","priceNumeric":497,"period":"/mês","blurb":"Até 2 módulos + Orçamentos em PDF, Campanhas Promocionais e PDV integrado à Retaguarda.","fullDescription":"O plano mais equilibrado para empresas em crescimento, combinando frente de caixa integrada à retaguarda ou ordem de serviço com gestão de estoque, orçamentos em PDF por WhatsApp/E-mail e motor de campanhas promocionais.","commercialCallout":"Mais escolhido por comércios e restaurantes","homeSummary":"Até 2 módulos liberados com motor de campanhas, orçamentos em PDF e equipe multi-usuário.","featured":true,"displayOrder":2,"active":true,"maxModules":2,"features":["Até 2 módulos liberados (ex: PDV + Retaguarda com Campanhas + Emissor Fiscal, ou Totem + PDV + Retaguarda)","Motor de Campanhas Promocionais (Leve X Pague Y, Faixas de Preço por Volume, Brindes)","Orçamentos Comerciais em PDF com envio direto por WhatsApp e E-mail","PDV integrado à retaguarda com persistência blindada contra queda de energia e F5","Multi-usuário no painel com permissões detalhadas por funcionário","Personalização com a marca da sua loja e prioridade no suporte"]}'::jsonb,'{"id":"silver","name":"Silver","price":"R$ 497","priceNumeric":497,"period":"/mês","blurb":"Até 2 módulos + Orçamentos em PDF, Campanhas Promocionais e PDV integrado à Retaguarda.","fullDescription":"O plano mais equilibrado para empresas em crescimento, combinando frente de caixa integrada à retaguarda ou ordem de serviço com gestão de estoque, orçamentos em PDF por WhatsApp/E-mail e motor de campanhas promocionais.","commercialCallout":"Mais escolhido por comércios e restaurantes","homeSummary":"Até 2 módulos liberados com motor de campanhas, orçamentos em PDF e equipe multi-usuário.","featured":true,"displayOrder":2,"active":true,"maxModules":2,"features":["Até 2 módulos liberados (ex: PDV + Retaguarda com Campanhas + Emissor Fiscal, ou Totem + PDV + Retaguarda)","Motor de Campanhas Promocionais (Leve X Pague Y, Faixas de Preço por Volume, Brindes)","Orçamentos Comerciais em PDF com envio direto por WhatsApp e E-mail","PDV integrado à retaguarda com persistência blindada contra queda de energia e F5","Multi-usuário no painel com permissões detalhadas por funcionário","Personalização com a marca da sua loja e prioridade no suporte"]}'::jsonb) ON CONFLICT (id) DO NOTHING;
INSERT INTO platform_commercial_plans(id, settings, defaults) VALUES ('golden','{"id":"golden","name":"Golden","price":"R$ 597","priceNumeric":597,"period":"/mês","blurb":"Ecossistema completo: Totem, Cardápio Digital & Food, OS, PDV + Retaguarda, Fiscal e E-commerce.","fullDescription":"Solução completa all-in-one para máxima eficiência operacional, unindo autoatendimento no totem, cardápio digital com QR code e KDS cozinha, retaguarda completa com PDV integrado, emissor fiscal e vendas online.","commercialCallout":"Ecossistema completo sem limitações","homeSummary":"Todos os módulos liberados: Cardápio Digital, Campanhas, Orçamentos, Fiscal e Suporte VIP.","featured":false,"displayOrder":3,"active":true,"maxModules":5,"allModules":true,"features":["Todos os módulos liberados: Totem + Cardápio Digital & KDS + OS + PDV + Retaguarda + Fiscal + E-commerce","Cardápio digital via QR Code nas mesas, gestão de comandas e KDS na TV da cozinha","Motor avançado de Campanhas Promocionais com validação e proteção de margem de lucro","Orçamentos Comerciais em PDF com conversão em 1 clique para venda no caixa","PDV veloz com recuperação offline/queda de energia, estorno seguro e conciliação financeira","Emissor fiscal completo (NF-e, NFC-e, NFS-e, CT-e, MDF-e) e integração com marketplaces","Acompanhamento comercial dedicado e suporte VIP prioritário contínuo"]}'::jsonb,'{"id":"golden","name":"Golden","price":"R$ 597","priceNumeric":597,"period":"/mês","blurb":"Ecossistema completo: Totem, Cardápio Digital & Food, OS, PDV + Retaguarda, Fiscal e E-commerce.","fullDescription":"Solução completa all-in-one para máxima eficiência operacional, unindo autoatendimento no totem, cardápio digital com QR code e KDS cozinha, retaguarda completa com PDV integrado, emissor fiscal e vendas online.","commercialCallout":"Ecossistema completo sem limitações","homeSummary":"Todos os módulos liberados: Cardápio Digital, Campanhas, Orçamentos, Fiscal e Suporte VIP.","featured":false,"displayOrder":3,"active":true,"maxModules":5,"allModules":true,"features":["Todos os módulos liberados: Totem + Cardápio Digital & KDS + OS + PDV + Retaguarda + Fiscal + E-commerce","Cardápio digital via QR Code nas mesas, gestão de comandas e KDS na TV da cozinha","Motor avançado de Campanhas Promocionais com validação e proteção de margem de lucro","Orçamentos Comerciais em PDF com conversão em 1 clique para venda no caixa","PDV veloz com recuperação offline/queda de energia, estorno seguro e conciliação financeira","Emissor fiscal completo (NF-e, NFC-e, NFS-e, CT-e, MDF-e) e integração com marketplaces","Acompanhamento comercial dedicado e suporte VIP prioritário contínuo"]}'::jsonb) ON CONFLICT (id) DO NOTHING;

-- [0030_store_module_state.sql]
CREATE TABLE IF NOT EXISTS store_module_state (
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  data JSONB NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(store_id, module_key)
);

-- [0031_stock_inventory_adjustments.sql]
CREATE TABLE IF NOT EXISTS stock_inventory_adjustments (
  store_id TEXT NOT NULL REFERENCES stores(id),
  balance_id TEXT NOT NULL,
  result JSONB NOT NULL,
  applied_by TEXT NOT NULL REFERENCES users(id),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(store_id,balance_id)
);
