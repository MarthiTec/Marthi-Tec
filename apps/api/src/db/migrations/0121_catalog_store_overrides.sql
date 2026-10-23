-- Tipos e modelos da plataforma (store_id NULL) valem para todas as lojas. A loja pode renomear ou
-- ocultar um deles só para ela, sem mudar o catálogo das outras lojas.
CREATE TABLE IF NOT EXISTS catalog_store_overrides (
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  ref_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('type', 'model')),
  name TEXT,
  hidden BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, ref_id)
);
