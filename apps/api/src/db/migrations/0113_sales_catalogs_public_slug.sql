-- Link curto público do catálogo digital: /c/{slug} (primeiro lado Marthi, sem bit.ly).
ALTER TABLE sales_catalogs ADD COLUMN IF NOT EXISTS public_slug TEXT;

-- Único quando preenchido (vários catálogos sem slug ainda são permitidos).
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_catalogs_public_slug
  ON sales_catalogs (lower(public_slug))
  WHERE public_slug IS NOT NULL AND public_slug <> '';
