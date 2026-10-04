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
 FOR target IN SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'store_id' AND table_name <> 'users' LOOP
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
