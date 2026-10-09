-- Fornecedor na formação do SKU: nome curto escolhido pela loja (vazio = nome fantasia ou o
-- primeiro nome do fornecedor) e, por produto, se o fornecedor entra ou não no SKU.
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS sku_name TEXT NOT NULL DEFAULT '';
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS sku_with_supplier BOOLEAN NOT NULL DEFAULT true;
