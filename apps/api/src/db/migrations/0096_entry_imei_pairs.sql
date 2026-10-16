-- Aparelho com dois IMEIs (dual chip): { IMEI principal: segundo IMEI } por entrada.
-- O principal continua em "imeis" (é ele que conta como unidade); o segundo não muda a quantidade.
ALTER TABLE stock_supplier_entries ADD COLUMN IF NOT EXISTS imei_pairs JSONB NOT NULL DEFAULT '{}';
