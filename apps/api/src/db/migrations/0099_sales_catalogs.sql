-- Catálogo de produtos para o cliente: a loja escolhe os produtos e a capa; o cliente abre por um link
-- público (token) com foto, nome e preço sempre atuais do estoque.
CREATE TABLE IF NOT EXISTS sales_catalogs (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Catálogo',
  subtitle TEXT NOT NULL DEFAULT '',
  show_cover BOOLEAN NOT NULL DEFAULT true,
  cover_style TEXT NOT NULL DEFAULT 'diagonal' CHECK (cover_style IN ('diagonal', 'band')),
  cover_image TEXT NOT NULL DEFAULT '',
  accent TEXT NOT NULL DEFAULT '#e4572e',
  show_prices BOOLEAN NOT NULL DEFAULT true,
  hide_sold_out BOOLEAN NOT NULL DEFAULT true,
  note TEXT NOT NULL DEFAULT '',
  product_ids JSONB NOT NULL DEFAULT '[]',
  token TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_catalogs_store ON sales_catalogs(store_id, updated_at DESC);
