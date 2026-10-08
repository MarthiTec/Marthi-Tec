-- Tipo de garantia da venda: da loja (com prazo), somente do fabricante, ou sem garantia.
-- Vendas antigas continuam como garantia da loja.
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS warranty_type TEXT NOT NULL DEFAULT 'store';
