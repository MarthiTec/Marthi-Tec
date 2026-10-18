-- Manutenções ligadas ao produto (aparelho do estoque) e com custo (além do valor de venda).
ALTER TABLE repair_services ADD COLUMN IF NOT EXISTS product_id TEXT;
ALTER TABLE repair_services ADD COLUMN IF NOT EXISTS cost NUMERIC(12,2);
CREATE INDEX IF NOT EXISTS repair_services_product_idx ON repair_services (store_id, product_id);
