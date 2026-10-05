ALTER TABLE stock_items ADD COLUMN avg_cost NUMERIC(12,2) NOT NULL DEFAULT 0;
UPDATE stock_items SET avg_cost=cost;
ALTER TABLE stock_items ADD COLUMN pricing_policy JSONB NOT NULL DEFAULT '{}';
ALTER TABLE stock_invoices ADD COLUMN kind TEXT NOT NULL DEFAULT 'entry' CHECK(kind IN ('entry','exit'));
ALTER TABLE stock_invoices ADD COLUMN status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','posted','cancelled'));
ALTER TABLE stock_invoices ADD COLUMN details JSONB NOT NULL DEFAULT '{}';
ALTER TABLE stock_invoices ADD COLUMN posted_at TIMESTAMPTZ;
ALTER TABLE stock_invoices ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE stock_invoice_lines ADD COLUMN unit_price NUMERIC(12,2) NOT NULL DEFAULT 0;
CREATE INDEX stock_movements_entry_history ON stock_movements(store_id,stock_id,created_at DESC) WHERE type='in';
CREATE FUNCTION guard_stock_invoice_line_store() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE invoice_store TEXT; product_store TEXT;
BEGIN
 SELECT store_id INTO invoice_store FROM stock_invoices WHERE id=NEW.invoice_id;
 SELECT store_id INTO product_store FROM stock_items WHERE id=NEW.stock_item_id;
 IF invoice_store IS DISTINCT FROM product_store THEN RAISE EXCEPTION 'Invoice item belongs to another store' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_stock_invoice_line_store BEFORE INSERT OR UPDATE ON stock_invoice_lines FOR EACH ROW EXECUTE FUNCTION guard_stock_invoice_line_store();
