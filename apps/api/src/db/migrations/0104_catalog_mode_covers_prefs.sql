-- Catálogo digital x página de venda, capas novas e preferências de tela por usuário.
ALTER TABLE sales_catalogs ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'sales';
ALTER TABLE sales_catalogs DROP CONSTRAINT IF EXISTS sales_catalogs_mode_check;
ALTER TABLE sales_catalogs ADD CONSTRAINT sales_catalogs_mode_check CHECK (mode IN ('catalog', 'sales'));
ALTER TABLE sales_catalogs DROP CONSTRAINT IF EXISTS sales_catalogs_cover_style_check;
ALTER TABLE sales_catalogs ADD CONSTRAINT sales_catalogs_cover_style_check CHECK (cover_style IN ('diagonal', 'band', 'hero', 'minimal', 'mosaic', 'dark'));

-- Configurações de tela (filtros, aba aberta, item escolhido…) de cada usuário em cada loja.
CREATE TABLE IF NOT EXISTS user_preferences (
  store_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, user_id, key)
);
