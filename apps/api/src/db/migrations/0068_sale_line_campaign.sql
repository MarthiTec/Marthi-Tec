-- Campanha aplicada em cada item da venda (auditoria: qual campanha e quanto de desconto).
ALTER TABLE sales_order_lines ADD COLUMN IF NOT EXISTS campaign_id TEXT;
ALTER TABLE sales_order_lines ADD COLUMN IF NOT EXISTS campaign_name TEXT NOT NULL DEFAULT '';
ALTER TABLE sales_order_lines ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
