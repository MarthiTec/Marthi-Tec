-- Modelos de plataforma para marcas Android já seedadas com tipos (0086).
-- Marca + Tipo + Modelo montam a Descrição no estoque simplificado (como iPhone).
-- store_id NULL = catálogo da plataforma; ON CONFLICT DO NOTHING = idempotente.

-- Samsung — GALAXY S
INSERT INTO catalog_models (id, store_id, type_id, name, sort)
SELECT 'CM-SAMSUNG-GALAXY-S-' || regexp_replace(upper(m.name), '[^A-Z0-9]+', '-', 'g'), NULL, 'CT-SAMSUNG-GALAXY-S', m.name, m.sort
FROM (VALUES
  ('20', 1), ('20 FE', 2), ('20 ULTRA', 3),
  ('21', 4), ('21 FE', 5), ('21 ULTRA', 6),
  ('22', 7), ('22 ULTRA', 8),
  ('23', 9), ('23 FE', 10), ('23 ULTRA', 11),
  ('24', 12), ('24 FE', 13), ('24 PLUS', 14), ('24 ULTRA', 15),
  ('25', 16), ('25 FE', 17), ('25 PLUS', 18), ('25 ULTRA', 19)
) AS m(name, sort)
ON CONFLICT (id) DO NOTHING;

-- Samsung — GALAXY A
INSERT INTO catalog_models (id, store_id, type_id, name, sort)
SELECT 'CM-SAMSUNG-GALAXY-A-' || regexp_replace(upper(m.name), '[^A-Z0-9]+', '-', 'g'), NULL, 'CT-SAMSUNG-GALAXY-A', m.name, m.sort
FROM (VALUES
  ('04', 1), ('05', 2), ('05S', 3), ('06', 4),
  ('14', 5), ('15', 6), ('15 5G', 7), ('16', 8), ('16 5G', 9),
  ('23', 10), ('24', 11), ('25', 12),
  ('34', 13), ('35', 14), ('54', 15), ('55', 16), ('56', 17)
) AS m(name, sort)
ON CONFLICT (id) DO NOTHING;

-- Samsung — GALAXY Z
INSERT INTO catalog_models (id, store_id, type_id, name, sort)
SELECT 'CM-SAMSUNG-GALAXY-Z-' || regexp_replace(upper(m.name), '[^A-Z0-9]+', '-', 'g'), NULL, 'CT-SAMSUNG-GALAXY-Z', m.name, m.sort
FROM (VALUES
  ('FLIP 4', 1), ('FLIP 5', 2), ('FLIP 6', 3),
  ('FOLD 4', 4), ('FOLD 5', 5), ('FOLD 6', 6)
) AS m(name, sort)
ON CONFLICT (id) DO NOTHING;

-- Samsung — GALAXY TAB
INSERT INTO catalog_models (id, store_id, type_id, name, sort)
SELECT 'CM-SAMSUNG-GALAXY-TAB-' || regexp_replace(upper(m.name), '[^A-Z0-9]+', '-', 'g'), NULL, 'CT-SAMSUNG-GALAXY-TAB', m.name, m.sort
FROM (VALUES
  ('A9', 1), ('S6 LITE', 2), ('S8', 3), ('S9', 4), ('S9 FE', 5), ('S10', 6)
) AS m(name, sort)
ON CONFLICT (id) DO NOTHING;

-- Samsung — GALAXY WATCH
INSERT INTO catalog_models (id, store_id, type_id, name, sort)
SELECT 'CM-SAMSUNG-GALAXY-WATCH-' || regexp_replace(upper(m.name), '[^A-Z0-9]+', '-', 'g'), NULL, 'CT-SAMSUNG-GALAXY-WATCH', m.name, m.sort
FROM (VALUES
  ('4', 1), ('5', 2), ('5 PRO', 3), ('6', 4), ('6 CLASSIC', 5), ('7', 6), ('ULTRA', 7)
) AS m(name, sort)
ON CONFLICT (id) DO NOTHING;

-- Samsung — GALAXY BUDS
INSERT INTO catalog_models (id, store_id, type_id, name, sort)
SELECT 'CM-SAMSUNG-GALAXY-BUDS-' || regexp_replace(upper(m.name), '[^A-Z0-9]+', '-', 'g'), NULL, 'CT-SAMSUNG-GALAXY-BUDS', m.name, m.sort
FROM (VALUES
  ('2', 1), ('2 PRO', 2), ('FE', 3), ('3', 4), ('3 PRO', 5)
) AS m(name, sort)
ON CONFLICT (id) DO NOTHING;

-- Xiaomi — REDMI
INSERT INTO catalog_models (id, store_id, type_id, name, sort)
SELECT 'CM-XIAOMI-REDMI-' || regexp_replace(upper(m.name), '[^A-Z0-9]+', '-', 'g'), NULL, 'CT-XIAOMI-REDMI', m.name, m.sort
FROM (VALUES
  ('12', 1), ('12C', 2), ('13', 3), ('13C', 4), ('14', 5), ('14C', 6),
  ('A3', 7), ('A3 PRO', 8), ('A4', 9)
) AS m(name, sort)
ON CONFLICT (id) DO NOTHING;

-- Xiaomi — REDMI NOTE
INSERT INTO catalog_models (id, store_id, type_id, name, sort)
SELECT 'CM-XIAOMI-REDMI-NOTE-' || regexp_replace(upper(m.name), '[^A-Z0-9]+', '-', 'g'), NULL, 'CT-XIAOMI-REDMI-NOTE', m.name, m.sort
FROM (VALUES
  ('11', 1), ('12', 2), ('12 PRO', 3), ('12S', 4),
  ('13', 5), ('13 PRO', 6), ('13 PRO PLUS', 7),
  ('14', 8), ('14 PRO', 9), ('14 PRO PLUS', 10)
) AS m(name, sort)
ON CONFLICT (id) DO NOTHING;

-- Xiaomi — POCO
INSERT INTO catalog_models (id, store_id, type_id, name, sort)
SELECT 'CM-XIAOMI-POCO-' || regexp_replace(upper(m.name), '[^A-Z0-9]+', '-', 'g'), NULL, 'CT-XIAOMI-POCO', m.name, m.sort
FROM (VALUES
  ('C65', 1), ('M6', 2), ('M6 PRO', 3),
  ('X5', 4), ('X5 PRO', 5), ('X6', 6), ('X6 PRO', 7),
  ('F5', 8), ('F6', 9), ('F6 PRO', 10)
) AS m(name, sort)
ON CONFLICT (id) DO NOTHING;

-- Xiaomi — XIAOMI (série principal)
INSERT INTO catalog_models (id, store_id, type_id, name, sort)
SELECT 'CM-XIAOMI-XIAOMI-' || regexp_replace(upper(m.name), '[^A-Z0-9]+', '-', 'g'), NULL, 'CT-XIAOMI-XIAOMI', m.name, m.sort
FROM (VALUES
  ('12', 1), ('13', 2), ('13T', 3), ('13T PRO', 4),
  ('14', 5), ('14T', 6), ('14T PRO', 7), ('14 ULTRA', 8),
  ('15', 9), ('15T', 10)
) AS m(name, sort)
ON CONFLICT (id) DO NOTHING;

-- Motorola — MOTO G
INSERT INTO catalog_models (id, store_id, type_id, name, sort)
SELECT 'CM-MOTOROLA-MOTO-G-' || regexp_replace(upper(m.name), '[^A-Z0-9]+', '-', 'g'), NULL, 'CT-MOTOROLA-MOTO-G', m.name, m.sort
FROM (VALUES
  ('22', 1), ('23', 2), ('24', 3),
  ('32', 4), ('34', 5), ('53', 6), ('54', 7), ('55', 8),
  ('73', 9), ('84', 10), ('85', 11),
  ('POWER', 12), ('STYLUS', 13)
) AS m(name, sort)
ON CONFLICT (id) DO NOTHING;

-- Motorola — MOTO E
INSERT INTO catalog_models (id, store_id, type_id, name, sort)
SELECT 'CM-MOTOROLA-MOTO-E-' || regexp_replace(upper(m.name), '[^A-Z0-9]+', '-', 'g'), NULL, 'CT-MOTOROLA-MOTO-E', m.name, m.sort
FROM (VALUES
  ('13', 1), ('14', 2), ('22', 3), ('32', 4), ('40', 5)
) AS m(name, sort)
ON CONFLICT (id) DO NOTHING;

-- Motorola — EDGE
INSERT INTO catalog_models (id, store_id, type_id, name, sort)
SELECT 'CM-MOTOROLA-EDGE-' || regexp_replace(upper(m.name), '[^A-Z0-9]+', '-', 'g'), NULL, 'CT-MOTOROLA-EDGE', m.name, m.sort
FROM (VALUES
  ('30', 1), ('40', 2), ('40 PRO', 3),
  ('50', 4), ('50 FUSION', 5), ('50 PRO', 6), ('50 ULTRA', 7)
) AS m(name, sort)
ON CONFLICT (id) DO NOTHING;

-- Motorola — RAZR
INSERT INTO catalog_models (id, store_id, type_id, name, sort)
SELECT 'CM-MOTOROLA-RAZR-' || regexp_replace(upper(m.name), '[^A-Z0-9]+', '-', 'g'), NULL, 'CT-MOTOROLA-RAZR', m.name, m.sort
FROM (VALUES
  ('40', 1), ('40 ULTRA', 2), ('50', 3), ('50 ULTRA', 4)
) AS m(name, sort)
ON CONFLICT (id) DO NOTHING;

-- Realme — REALME
INSERT INTO catalog_models (id, store_id, type_id, name, sort)
SELECT 'CM-REALME-REALME-' || regexp_replace(upper(m.name), '[^A-Z0-9]+', '-', 'g'), NULL, 'CT-REALME-REALME', m.name, m.sort
FROM (VALUES
  ('10', 1), ('11', 2), ('12', 3), ('12 PRO', 4), ('12 PRO PLUS', 5),
  ('13', 6), ('GT NEO', 7), ('GT 6', 8)
) AS m(name, sort)
ON CONFLICT (id) DO NOTHING;

-- Realme — REALME NOTE
INSERT INTO catalog_models (id, store_id, type_id, name, sort)
SELECT 'CM-REALME-NOTE-' || regexp_replace(upper(m.name), '[^A-Z0-9]+', '-', 'g'), NULL, 'CT-REALME-NOTE', m.name, m.sort
FROM (VALUES
  ('50', 1), ('60', 2)
) AS m(name, sort)
ON CONFLICT (id) DO NOTHING;

-- Realme — REALME C
INSERT INTO catalog_models (id, store_id, type_id, name, sort)
SELECT 'CM-REALME-C-' || regexp_replace(upper(m.name), '[^A-Z0-9]+', '-', 'g'), NULL, 'CT-REALME-C', m.name, m.sort
FROM (VALUES
  ('51', 1), ('53', 2), ('55', 3), ('67', 4), ('75', 5)
) AS m(name, sort)
ON CONFLICT (id) DO NOTHING;
