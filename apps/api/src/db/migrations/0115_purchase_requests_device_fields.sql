-- Campos de aparelho na solicitação de compra (mesmo padrão do cadastro de estoque:
-- marca → tipo → modelo → descrição; depois cor, capacidade e condição).
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS catalog_type_id TEXT;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS catalog_model_id TEXT;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS device_type TEXT NOT NULL DEFAULT '';
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS device_model TEXT NOT NULL DEFAULT '';
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '';
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS capacity TEXT NOT NULL DEFAULT '';
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS condition TEXT NOT NULL DEFAULT 'new';
DO $$ BEGIN
  ALTER TABLE purchase_requests ADD CONSTRAINT purchase_requests_condition_check
    CHECK (condition IN ('new', 'used'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
