-- Catálogo: produtos sob encomenda (sem unidade na loja, mas com encomenda) entram sempre, mesmo sem
-- marcar, inclusive os cadastrados depois. Ligado por padrão.
ALTER TABLE sales_catalogs ADD COLUMN IF NOT EXISTS include_order_products BOOLEAN NOT NULL DEFAULT true;
