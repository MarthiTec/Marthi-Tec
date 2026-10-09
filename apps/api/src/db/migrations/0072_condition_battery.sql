-- Condição (novo, usado, recondicionado) com nível de bateria por variação e no produto simples.
-- Novo = 100%. A condição e a bateria aparecem no totem, a não ser que a loja desligue no produto.
ALTER TABLE stock_item_variations ADD COLUMN IF NOT EXISTS battery_level INT CHECK (battery_level IS NULL OR (battery_level BETWEEN 0 AND 100));
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS battery_level INT CHECK (battery_level IS NULL OR (battery_level BETWEEN 0 AND 100));
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS show_condition_on_totem BOOLEAN NOT NULL DEFAULT true;
