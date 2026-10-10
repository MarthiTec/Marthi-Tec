-- Atualiza bancos que aplicaram a primeira versão da 0075 (só vendas, registro apagado no cancelamento):
-- tipos de saída (bonificação, uso interno, perda), estorno sem apagar o histórico e compra no financeiro.
-- Em bancos novos a 0075 já cria tudo e estes comandos não mudam nada.
ALTER TABLE stock_sold_units ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'sale';
ALTER TABLE stock_sold_units ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2);
ALTER TABLE stock_sold_units ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
ALTER TABLE stock_sold_units ADD COLUMN IF NOT EXISTS operator_name TEXT NOT NULL DEFAULT '';
ALTER TABLE stock_sold_units ADD COLUMN IF NOT EXISTS reverted_at TIMESTAMPTZ;
ALTER TABLE stock_sold_units ADD COLUMN IF NOT EXISTS reverted_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE stock_sold_units ADD COLUMN IF NOT EXISTS reverted_by TEXT NOT NULL DEFAULT '';
ALTER TABLE stock_sold_units ALTER COLUMN sale_id DROP NOT NULL;

-- O IMEI só não pode ter duas saídas ATIVAS (estornadas ficam no histórico).
DROP INDEX IF EXISTS stock_sold_units_imei;
CREATE UNIQUE INDEX IF NOT EXISTS stock_sold_units_active_imei ON stock_sold_units(store_id, imei) WHERE imei <> '' AND reverted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_stock_sold_units_imei ON stock_sold_units(store_id, imei);

-- Preço das vendas já marcadas, para o relatório por IMEI.
UPDATE stock_sold_units u SET unit_price = l.unit_price
  FROM sales_order_lines l
 WHERE l.id = u.sale_line_id AND u.unit_price IS NULL;

ALTER TABLE stock_supplier_entries ADD COLUMN IF NOT EXISTS payable_id TEXT;
