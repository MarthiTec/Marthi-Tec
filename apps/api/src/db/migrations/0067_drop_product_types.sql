-- "Tipo de produto" saiu: a loja organiza os produtos só por grupo e subgrupo, com o nome que preferir.
-- Nenhuma loja chegou a cadastrar tipos (tabela vazia em produção quando isto foi escrito).
ALTER TABLE stock_items DROP COLUMN IF EXISTS product_type_id;
DROP TABLE IF EXISTS product_types;
