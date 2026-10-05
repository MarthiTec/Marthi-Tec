-- Schema only: no tenant-specific catalog, prices, stock quantities or user replacement.
  -- 1. Assegurar colunas e tabelas essenciais
  ALTER TABLE stores ADD COLUMN IF NOT EXISTS segment TEXT NOT NULL DEFAULT 'assistencia_tecnica';
  ALTER TABLE stores ADD COLUMN IF NOT EXISTS attribute_automation_enabled BOOLEAN NOT NULL DEFAULT true;

  CREATE TABLE IF NOT EXISTS commercial_store_customization (
    store_id TEXT PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
    settings JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS commercial_profiles (
    store_id TEXT PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
    segment_id TEXT NOT NULL,
    settings JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
