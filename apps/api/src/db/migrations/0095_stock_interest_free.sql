-- Juros no cartão por produto: 0 = com juros (padrão, a taxa da maquininha vai para o cliente);
-- N = sem juros até N parcelas (acima disso, volta a ter juros).
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS interest_free_installments INT NOT NULL DEFAULT 0;
DO $$ BEGIN
  ALTER TABLE stock_items ADD CONSTRAINT stock_items_interest_free_range CHECK (interest_free_installments BETWEEN 0 AND 24);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
