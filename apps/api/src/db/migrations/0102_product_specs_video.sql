-- Página de venda: vídeo do aparelho e ficha técnica (opcionais) no cadastro do produto, e os produtos
-- em destaque de cada catálogo.
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS video_url TEXT NOT NULL DEFAULT '';
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS specs JSONB NOT NULL DEFAULT '[]';
ALTER TABLE sales_catalogs ADD COLUMN IF NOT EXISTS featured_ids JSONB NOT NULL DEFAULT '[]';
