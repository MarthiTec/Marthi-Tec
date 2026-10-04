-- Per-store brand management, compatible with the legacy global brands table.
CREATE TABLE IF NOT EXISTS store_brands (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_store_brands_slug UNIQUE (store_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_store_brands_store ON store_brands(store_id);
-- Preserve legacy brand definitions for each store, leaving legacy references intact.
INSERT INTO store_brands (id, store_id, slug, name)
SELECT 'BRD-' || substr(md5(s.id || ':' || b.slug), 1, 16), s.id, b.slug, b.name
FROM stores s CROSS JOIN brands b
WHERE to_jsonb(b)->>'store_id' IS NULL OR to_jsonb(b)->>'store_id' = s.id
ON CONFLICT (store_id, slug) DO NOTHING;
INSERT INTO store_brands (id, store_id, slug, name)
SELECT 'BRD-' || substr(md5(src.store_id || ':' || src.slug), 1, 16), src.store_id, src.slug, src.name
FROM (
  SELECT DISTINCT ON (store_id, lower(trim(brand))) store_id,
         lower(trim(brand)) AS slug, initcap(trim(brand)) AS name
  FROM stock_items WHERE trim(brand) <> '' AND lower(trim(brand)) <> 'custom'
  ORDER BY store_id, lower(trim(brand))
) src ON CONFLICT (store_id, slug) DO NOTHING;
-- Persist the former picker options as editable records, rather than runtime presets.
INSERT INTO store_brands (id, store_id, slug, name)
SELECT 'BRD-' || substr(md5(s.id || ':' || v.slug), 1, 16), s.id, v.slug, v.name
FROM stores s CROSS JOIN (VALUES
  ('apple', 'Apple'), ('xiaomi', 'Xiaomi'), ('samsung', 'Samsung'),
  ('motorola', 'Motorola'), ('realme', 'Realme')
) AS v(slug, name) ON CONFLICT (store_id, slug) DO NOTHING;
