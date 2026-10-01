-- ============================================================================
-- 0014_unify_products_and_cleanup_attributes.sql
-- 1. Limpeza definitiva de atributos de teste indesejados ('MAIS UM TESTE PAPAI', 'TESTE')
-- 2. Garantia dos atributos oficiais 'Cor' e 'Capacidade' para a loja Cell Ponto
-- 3. Unificação de produtos: migrar dados remanescentes de products para stock_items
-- 4. Transformação da tabela legada products em VIEW atualizável sobre stock_items
-- ============================================================================

-- 1. Excluir atributos de testes indesejados de qualquer loja
DELETE FROM product_attribute_values
WHERE attribute_id IN (
  SELECT id FROM product_attributes
  WHERE UPPER(TRIM(name)) IN ('MAIS UM TESTE PAPAI', 'TESTE')
);

DELETE FROM product_attributes
WHERE UPPER(TRIM(name)) IN ('MAIS UM TESTE PAPAI', 'TESTE');

-- 2. Garantir atributos Cor e Capacidade para a loja Cell Ponto (STR-DEMO-01)
-- Atributo Cor
INSERT INTO product_attributes (id, store_id, name, use_on_totem, filter_on_totem, use_on_stock, sort, active)
VALUES ('ATTR-COR-CELLPONTO', 'STR-DEMO-01', 'Cor', true, true, true, 1, true)
ON CONFLICT (id) DO UPDATE SET
  name = 'Cor',
  store_id = 'STR-DEMO-01',
  use_on_totem = true,
  filter_on_totem = true,
  use_on_stock = true,
  sort = 1,
  active = true;

-- Valores de Cor
INSERT INTO product_attribute_values (id, attribute_id, value, price_delta, sort)
VALUES
  ('VAL-COR-01', 'ATTR-COR-CELLPONTO', 'Preto', 0, 1),
  ('VAL-COR-02', 'ATTR-COR-CELLPONTO', 'Branco', 0, 2),
  ('VAL-COR-03', 'ATTR-COR-CELLPONTO', 'Azul', 0, 3),
  ('VAL-COR-04', 'ATTR-COR-CELLPONTO', 'Desert', 0, 4),
  ('VAL-COR-05', 'ATTR-COR-CELLPONTO', 'Titânio Natural', 0, 5),
  ('VAL-COR-06', 'ATTR-COR-CELLPONTO', 'Prata', 0, 6),
  ('VAL-COR-07', 'ATTR-COR-CELLPONTO', 'Dourado', 0, 7)
ON CONFLICT (attribute_id, value) DO UPDATE SET
  sort = EXCLUDED.sort;

-- Atributo Capacidade
INSERT INTO product_attributes (id, store_id, name, use_on_totem, filter_on_totem, use_on_stock, sort, active)
VALUES ('ATTR-CAP-CELLPONTO', 'STR-DEMO-01', 'Capacidade', true, true, true, 2, true)
ON CONFLICT (id) DO UPDATE SET
  name = 'Capacidade',
  store_id = 'STR-DEMO-01',
  use_on_totem = true,
  filter_on_totem = true,
  use_on_stock = true,
  sort = 2,
  active = true;

-- Valores de Capacidade
INSERT INTO product_attribute_values (id, attribute_id, value, price_delta, sort)
VALUES
  ('VAL-CAP-01', 'ATTR-CAP-CELLPONTO', '64 GB', 0, 1),
  ('VAL-CAP-02', 'ATTR-CAP-CELLPONTO', '128 GB', 0, 2),
  ('VAL-CAP-03', 'ATTR-CAP-CELLPONTO', '256 GB', 0, 3),
  ('VAL-CAP-04', 'ATTR-CAP-CELLPONTO', '512 GB', 0, 4),
  ('VAL-CAP-05', 'ATTR-CAP-CELLPONTO', '1 TB', 0, 5)
ON CONFLICT (attribute_id, value) DO UPDATE SET
  sort = EXCLUDED.sort;

-- 3. Unificação de Produtos: migrar qualquer produto da tabela legada 'products' para 'stock_items'
DO $$
BEGIN
  -- Se products for uma tabela física (não view), executa a migração e conversão
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'products' AND table_type = 'BASE TABLE'
  ) THEN
    -- Migra dados de products para stock_items
    INSERT INTO stock_items (
      id, store_id, name, sku, price, kind, condition, category, active, show_on_totem, created_at, updated_at
    )
    SELECT
      p.id,
      p.store_id,
      p.name,
      COALESCE(p.reference, ''),
      COALESCE(p.cash_price, 0),
      'part'::stock_kind,
      'new'::stock_condition,
      'Geral',
      (p.status = 'active'),
      true,
      p.created_at,
      p.updated_at
    FROM products p
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      price = EXCLUDED.price,
      show_on_totem = true;

    -- Remove FK de stock_items se apontar para products
    ALTER TABLE stock_items DROP CONSTRAINT IF EXISTS stock_items_product_id_fkey;

    -- Remove product_images se existir
    DROP TABLE IF EXISTS product_images CASCADE;

    -- Converte a tabela products em VIEW sobre stock_items
    DROP TABLE IF EXISTS products CASCADE;

    CREATE OR REPLACE VIEW products AS
      SELECT
        id,
        store_id,
        name,
        CASE WHEN active THEN 'active'::product_status ELSE 'inactive'::product_status END AS status,
        sku AS reference,
        price AS cash_price,
        0 AS sort,
        created_at,
        updated_at
      FROM stock_items;

  END IF;
END $$;

-- 4. Criar função e trigger INSTEAD OF para garantir que qualquer operação em 'products' reflita em 'stock_items'
CREATE OR REPLACE FUNCTION fn_instead_products()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO stock_items (id, store_id, name, sku, price, active, show_on_totem)
    VALUES (
      COALESCE(NEW.id, 'STK-' || substr(md5(random()::text), 1, 8)),
      COALESCE(NEW.store_id, 'STR-DEMO-01'),
      NEW.name,
      COALESCE(NEW.reference, ''),
      COALESCE(NEW.cash_price, 0),
      (NEW.status = 'active'),
      true
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      price = EXCLUDED.price;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE stock_items
    SET name = COALESCE(NEW.name, name),
        sku = COALESCE(NEW.reference, sku),
        price = COALESCE(NEW.cash_price, price),
        active = (NEW.status = 'active'),
        updated_at = now()
    WHERE id = OLD.id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM stock_items WHERE id = OLD.id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.views 
    WHERE table_schema = 'public' AND table_name = 'products'
  ) THEN
    DROP TRIGGER IF EXISTS trg_instead_products ON products;
    CREATE TRIGGER trg_instead_products
    INSTEAD OF INSERT OR UPDATE OR DELETE ON products
    FOR EACH ROW EXECUTE FUNCTION fn_instead_products();
  END IF;
END $$;
