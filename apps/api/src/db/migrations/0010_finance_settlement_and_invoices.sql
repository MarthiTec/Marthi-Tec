-- Migration 0010: Finance Settlement, Interest, Fine, Discount, Document Number, and Fiscal Invoice Link
-- Suporte completo a baixa com juros, multa, desconto, pagamento parcial e vínculo com Notas Fiscais (Entrada/Saída)

ALTER TABLE payables ADD COLUMN IF NOT EXISTS document_number TEXT DEFAULT '';
ALTER TABLE payables ADD COLUMN IF NOT EXISTS interest_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE payables ADD COLUMN IF NOT EXISTS fine_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE payables ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE payables ADD COLUMN IF NOT EXISTS invoice_id TEXT;
ALTER TABLE payables ADD COLUMN IF NOT EXISTS invoice_number TEXT DEFAULT '';
ALTER TABLE payables ADD COLUMN IF NOT EXISTS invoice_type TEXT DEFAULT '';

ALTER TABLE receivables ADD COLUMN IF NOT EXISTS document_number TEXT DEFAULT '';
ALTER TABLE receivables ADD COLUMN IF NOT EXISTS interest_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE receivables ADD COLUMN IF NOT EXISTS fine_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE receivables ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE receivables ADD COLUMN IF NOT EXISTS invoice_id TEXT;
ALTER TABLE receivables ADD COLUMN IF NOT EXISTS invoice_number TEXT DEFAULT '';
ALTER TABLE receivables ADD COLUMN IF NOT EXISTS invoice_type TEXT DEFAULT '';
