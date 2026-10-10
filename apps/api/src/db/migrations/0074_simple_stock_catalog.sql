-- Cadastro simplificado de produtos:
--  * Tipos por marca (Apple → IPHONE, IPAD, MACBOOK…) e Modelos por tipo (IPHONE → 15 PRO MAX…).
--    Linhas com store_id vazio são o catálogo da plataforma (todas as lojas veem); cada loja pode
--    acrescentar os seus. Marca + Tipo + Modelo montam a descrição do produto.
--  * Origem do fornecedor: Empresa ou Upgrade (aparelho recebido na troca).
--  * Quem cadastrou o produto.
--  * Modo do estoque da loja: simplificado ou padrão (lojas de celular/assistência: simplificado).

CREATE TABLE IF NOT EXISTS catalog_types (
  id TEXT PRIMARY KEY,
  store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
  brand_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  sort INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_catalog_types_brand ON catalog_types(brand_slug);
CREATE UNIQUE INDEX IF NOT EXISTS catalog_types_unique ON catalog_types(COALESCE(store_id, ''), brand_slug, lower(name));

CREATE TABLE IF NOT EXISTS catalog_models (
  id TEXT PRIMARY KEY,
  store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
  type_id TEXT NOT NULL REFERENCES catalog_types(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_catalog_models_type ON catalog_models(type_id);
CREATE UNIQUE INDEX IF NOT EXISTS catalog_models_unique ON catalog_models(COALESCE(store_id, ''), type_id, lower(name));

ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS catalog_type_id TEXT REFERENCES catalog_types(id) ON DELETE SET NULL;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS catalog_model_id TEXT REFERENCES catalog_models(id) ON DELETE SET NULL;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS created_by_id TEXT;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS created_by_name TEXT NOT NULL DEFAULT '';

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'company';

ALTER TABLE stores ADD COLUMN IF NOT EXISTS stock_mode TEXT NOT NULL DEFAULT 'standard';
UPDATE stores SET stock_mode = 'simple' WHERE segment = 'assistencia_tecnica' AND stock_mode = 'standard';

-- Catálogo da plataforma: tipos por marca.
INSERT INTO catalog_types (id, store_id, brand_slug, name, sort) VALUES
  ('CT-APPLE-IPHONE', NULL, 'apple', 'IPHONE', 1),
  ('CT-APPLE-IPAD', NULL, 'apple', 'IPAD', 2),
  ('CT-APPLE-MACBOOK', NULL, 'apple', 'MACBOOK', 3),
  ('CT-APPLE-IMAC', NULL, 'apple', 'IMAC', 4),
  ('CT-APPLE-WATCH', NULL, 'apple', 'APPLE WATCH', 5),
  ('CT-APPLE-AIRPODS', NULL, 'apple', 'AIRPODS', 6),
  ('CT-APPLE-EARPODS', NULL, 'apple', 'EARPODS', 7),
  ('CT-APPLE-TV', NULL, 'apple', 'APPLE TV', 8),
  ('CT-SAMSUNG-GALAXY-S', NULL, 'samsung', 'GALAXY S', 1),
  ('CT-SAMSUNG-GALAXY-A', NULL, 'samsung', 'GALAXY A', 2),
  ('CT-SAMSUNG-GALAXY-Z', NULL, 'samsung', 'GALAXY Z', 3),
  ('CT-SAMSUNG-GALAXY-TAB', NULL, 'samsung', 'GALAXY TAB', 4),
  ('CT-SAMSUNG-GALAXY-WATCH', NULL, 'samsung', 'GALAXY WATCH', 5),
  ('CT-SAMSUNG-GALAXY-BUDS', NULL, 'samsung', 'GALAXY BUDS', 6),
  ('CT-XIAOMI-REDMI', NULL, 'xiaomi', 'REDMI', 1),
  ('CT-XIAOMI-REDMI-NOTE', NULL, 'xiaomi', 'REDMI NOTE', 2),
  ('CT-XIAOMI-POCO', NULL, 'xiaomi', 'POCO', 3),
  ('CT-XIAOMI-XIAOMI', NULL, 'xiaomi', 'XIAOMI', 4),
  ('CT-MOTOROLA-MOTO-G', NULL, 'motorola', 'MOTO G', 1),
  ('CT-MOTOROLA-MOTO-E', NULL, 'motorola', 'MOTO E', 2),
  ('CT-MOTOROLA-EDGE', NULL, 'motorola', 'EDGE', 3),
  ('CT-MOTOROLA-RAZR', NULL, 'motorola', 'RAZR', 4),
  ('CT-REALME-REALME', NULL, 'realme', 'REALME', 1),
  ('CT-REALME-NOTE', NULL, 'realme', 'REALME NOTE', 2),
  ('CT-REALME-C', NULL, 'realme', 'REALME C', 3)
ON CONFLICT (id) DO NOTHING;

-- Modelos: o nome não repete o tipo (IPHONE + "15 PRO MAX" = "IPHONE 15 PRO MAX").
INSERT INTO catalog_models (id, store_id, type_id, name, sort)
SELECT 'CM-IPHONE-' || regexp_replace(upper(m.name), '[^A-Z0-9]+', '-', 'g'), NULL, 'CT-APPLE-IPHONE', m.name, m.sort
FROM (VALUES
  ('XR', 1), ('XS', 2), ('XS MAX', 3),
  ('11', 4), ('11 PRO', 5), ('11 PRO MAX', 6),
  ('SE 2ª GERAÇÃO', 7), ('SE 3ª GERAÇÃO', 8),
  ('12 MINI', 9), ('12', 10), ('12 PRO', 11), ('12 PRO MAX', 12),
  ('13 MINI', 13), ('13', 14), ('13 PRO', 15), ('13 PRO MAX', 16),
  ('14', 17), ('14 PLUS', 18), ('14 PRO', 19), ('14 PRO MAX', 20),
  ('15', 21), ('15 PLUS', 22), ('15 PRO', 23), ('15 PRO MAX', 24),
  ('16E', 25), ('16', 26), ('16 PLUS', 27), ('16 PRO', 28), ('16 PRO MAX', 29),
  ('17', 30), ('17 AIR', 31), ('17 PRO', 32), ('17 PRO MAX', 33),
  ('18', 34), ('18 PRO', 35), ('18 PRO MAX', 36)
) AS m(name, sort)
ON CONFLICT (id) DO NOTHING;

INSERT INTO catalog_models (id, store_id, type_id, name, sort) VALUES
  ('CM-IPAD-PADRAO', NULL, 'CT-APPLE-IPAD', '10ª GERAÇÃO', 1),
  ('CM-IPAD-A16', NULL, 'CT-APPLE-IPAD', '11ª GERAÇÃO (A16)', 2),
  ('CM-IPAD-MINI', NULL, 'CT-APPLE-IPAD', 'MINI', 3),
  ('CM-IPAD-AIR', NULL, 'CT-APPLE-IPAD', 'AIR', 4),
  ('CM-IPAD-PRO', NULL, 'CT-APPLE-IPAD', 'PRO', 5),
  ('CM-MACBOOK-AIR', NULL, 'CT-APPLE-MACBOOK', 'AIR', 1),
  ('CM-MACBOOK-PRO', NULL, 'CT-APPLE-MACBOOK', 'PRO', 2),
  ('CM-WATCH-SE', NULL, 'CT-APPLE-WATCH', 'SE', 1),
  ('CM-WATCH-S9', NULL, 'CT-APPLE-WATCH', 'SERIES 9', 2),
  ('CM-WATCH-S10', NULL, 'CT-APPLE-WATCH', 'SERIES 10', 3),
  ('CM-WATCH-S11', NULL, 'CT-APPLE-WATCH', 'SERIES 11', 4),
  ('CM-WATCH-ULTRA2', NULL, 'CT-APPLE-WATCH', 'ULTRA 2', 5),
  ('CM-WATCH-ULTRA3', NULL, 'CT-APPLE-WATCH', 'ULTRA 3', 6),
  ('CM-AIRPODS-2', NULL, 'CT-APPLE-AIRPODS', '2', 1),
  ('CM-AIRPODS-3', NULL, 'CT-APPLE-AIRPODS', '3', 2),
  ('CM-AIRPODS-4', NULL, 'CT-APPLE-AIRPODS', '4', 3),
  ('CM-AIRPODS-PRO2', NULL, 'CT-APPLE-AIRPODS', 'PRO 2', 4),
  ('CM-AIRPODS-PRO3', NULL, 'CT-APPLE-AIRPODS', 'PRO 3', 5),
  ('CM-AIRPODS-MAX', NULL, 'CT-APPLE-AIRPODS', 'MAX', 6),
  ('CM-EARPODS-USBC', NULL, 'CT-APPLE-EARPODS', 'USB-C', 1),
  ('CM-EARPODS-LIGHTNING', NULL, 'CT-APPLE-EARPODS', 'LIGHTNING', 2),
  ('CM-EARPODS-P2', NULL, 'CT-APPLE-EARPODS', 'P2 (3,5 MM)', 3)
ON CONFLICT (id) DO NOTHING;
