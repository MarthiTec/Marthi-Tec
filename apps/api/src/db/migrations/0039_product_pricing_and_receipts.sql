-- Older deployments already have invoice headers and lines under legacy names.
-- Add canonical fields without deleting legacy data or reinitializing existing costs.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='stock_items' AND column_name='avg_cost') THEN
  ALTER TABLE stock_items ADD COLUMN avg_cost NUMERIC(12,2) NOT NULL DEFAULT 0;
  UPDATE stock_items SET avg_cost=cost;
 END IF;
END $$;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS pricing_policy JSONB NOT NULL DEFAULT '{}';
ALTER TABLE stock_invoices ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'entry' CHECK(kind IN ('entry','exit'));
ALTER TABLE stock_invoices ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','posted','cancelled'));
ALTER TABLE stock_invoices ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '{}';
ALTER TABLE stock_invoices ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;
ALTER TABLE stock_invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE stock_invoices ADD COLUMN IF NOT EXISTS series TEXT NOT NULL DEFAULT '';
ALTER TABLE stock_invoices ADD COLUMN IF NOT EXISTS issue_date DATE;
ALTER TABLE stock_invoices ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE stock_invoices ADD COLUMN IF NOT EXISTS issued_at VARCHAR NOT NULL DEFAULT '';
ALTER TABLE stock_invoices ALTER COLUMN issued_at SET DEFAULT '';
ALTER TABLE stock_invoice_lines ADD COLUMN IF NOT EXISTS stock_item_id TEXT REFERENCES stock_items(id) ON DELETE CASCADE;
ALTER TABLE stock_invoice_lines ADD COLUMN IF NOT EXISTS stock_id TEXT REFERENCES stock_items(id);
ALTER TABLE stock_invoice_lines ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';
ALTER TABLE stock_invoice_lines ALTER COLUMN name SET DEFAULT '';
ALTER TABLE stock_invoice_lines ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2) NOT NULL DEFAULT 0;
UPDATE stock_invoice_lines SET stock_item_id=stock_id WHERE stock_item_id IS NULL AND stock_id IS NOT NULL;
UPDATE stock_invoice_lines SET stock_id=stock_item_id WHERE stock_id IS NULL AND stock_item_id IS NOT NULL;
ALTER TABLE stock_invoice_lines ALTER COLUMN stock_item_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS stock_movements_entry_history ON stock_movements(store_id,stock_id,created_at DESC) WHERE type='in';
CREATE OR REPLACE FUNCTION sync_stock_invoice_legacy_header() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.issue_date IS NULL AND COALESCE(NEW.issued_at,'')<>'' THEN
  BEGIN NEW.issue_date=left(NEW.issued_at,10)::date;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN NULL;
  END;
 END IF;
 IF NEW.issue_date IS NOT NULL THEN NEW.issued_at=NEW.issue_date::text; END IF;
 NEW.details=jsonb_strip_nulls(jsonb_build_object('documentPurpose',to_jsonb(NEW)->>'document_purpose','customerName',to_jsonb(NEW)->>'customer_name')) || NEW.details;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER sync_stock_invoice_legacy_header BEFORE INSERT OR UPDATE ON stock_invoices FOR EACH ROW EXECUTE FUNCTION sync_stock_invoice_legacy_header();
UPDATE stock_invoices SET issue_date=issue_date WHERE issue_date IS NULL;
CREATE OR REPLACE FUNCTION guard_stock_invoice_line_store() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE invoice_store TEXT; product_store TEXT;
BEGIN
 NEW.stock_item_id=COALESCE(NEW.stock_item_id,NEW.stock_id);
 NEW.stock_id=NEW.stock_item_id;
 SELECT store_id INTO invoice_store FROM stock_invoices WHERE id=NEW.invoice_id;
 SELECT store_id INTO product_store FROM stock_items WHERE id=NEW.stock_item_id;
 IF invoice_store IS NULL OR product_store IS NULL OR invoice_store IS DISTINCT FROM product_store THEN RAISE EXCEPTION 'Invoice item belongs to another store' USING ERRCODE='23514'; END IF;
 IF NEW.name='' THEN SELECT name INTO NEW.name FROM stock_items WHERE id=NEW.stock_item_id; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER guard_stock_invoice_line_store BEFORE INSERT OR UPDATE ON stock_invoice_lines FOR EACH ROW EXECUTE FUNCTION guard_stock_invoice_line_store();
