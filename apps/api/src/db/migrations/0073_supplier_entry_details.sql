-- Entradas de estoque com bateria por aparelho e origem: compra de fornecedor ou aparelho recebido
-- na troca da venda externa (o "fornecedor" é o cliente). ref_id liga a entrada à troca (para estornar).
ALTER TABLE stock_supplier_entries ADD COLUMN IF NOT EXISTS battery_level INT CHECK (battery_level IS NULL OR (battery_level BETWEEN 0 AND 100));
ALTER TABLE stock_supplier_entries ADD COLUMN IF NOT EXISTS customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE stock_supplier_entries ADD COLUMN IF NOT EXISTS customer_name TEXT NOT NULL DEFAULT '';
ALTER TABLE stock_supplier_entries ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'supplier';
ALTER TABLE stock_supplier_entries ADD COLUMN IF NOT EXISTS ref_id TEXT;
CREATE INDEX IF NOT EXISTS idx_stock_supplier_entries_ref ON stock_supplier_entries(store_id, ref_id);
