-- ----------------------------------------------------------------------------
-- 0046_stock_item_variations.sql
-- Adiciona suporte a variações master-detail de produtos
-- Master = Cabeçalho (stock_items com 1 único SKU do produto)
-- Detail = Grades de variações do produto (stock_item_variations e coluna variations JSONB)
-- ----------------------------------------------------------------------------

ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS variations JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS stock_item_variations (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  stock_item_id TEXT NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  attrs JSONB NOT NULL DEFAULT '{}'::jsonb,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  avg_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  qty INT NOT NULL DEFAULT 0,
  min_qty INT NOT NULL DEFAULT 0,
  card_rate NUMERIC(6,2),
  condition TEXT NOT NULL DEFAULT 'new',
  barcode TEXT NOT NULL DEFAULT '',
  imei TEXT NOT NULL DEFAULT '',
  pickup_prices JSONB NOT NULL DEFAULT '{}'::jsonb,
  pricing_policy JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_item_variations_item ON stock_item_variations(stock_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_item_variations_store ON stock_item_variations(store_id);

-- Consolidar produtos legados duplicados pelo bug anterior
DO $$
DECLARE
  grp RECORD;
  master_id TEXT;
  var_array JSONB;
  sib RECORD;
BEGIN
  FOR grp IN
    SELECT store_id, lower(trim(name)) as norm_name, count(*) as cnt, min(id) as first_id
    FROM stock_items
    GROUP BY store_id, lower(trim(name))
    HAVING count(*) > 1
  LOOP
    master_id := grp.first_id;
    var_array := '[]'::jsonb;

    FOR sib IN
      SELECT id, attrs, price, cost, avg_cost, qty, min_qty, card_rate, condition, barcode, imei, pickup_prices, pricing_policy, color, capacity
      FROM stock_items
      WHERE store_id = grp.store_id AND lower(trim(name)) = grp.norm_name
      ORDER BY id ASC
    LOOP
      var_array := var_array || jsonb_build_array(jsonb_build_object(
        'id', sib.id,
        'attrs', COALESCE(sib.attrs, '{}'::jsonb) ||
          CASE WHEN sib.color IS NOT NULL AND sib.color <> '' AND NOT (COALESCE(sib.attrs, '{}'::jsonb) ? 'ATTR-COR') THEN jsonb_build_object('ATTR-COR', sib.color) ELSE '{}'::jsonb END ||
          CASE WHEN sib.capacity IS NOT NULL AND sib.capacity <> '' AND NOT (COALESCE(sib.attrs, '{}'::jsonb) ? 'ATTR-CAP') THEN jsonb_build_object('ATTR-CAP', sib.capacity) ELSE '{}'::jsonb END,
        'price', sib.price,
        'cost', sib.cost,
        'avgCost', sib.avg_cost,
        'qty', sib.qty,
        'minQty', sib.min_qty,
        'cardRate', sib.card_rate,
        'condition', sib.condition,
        'barcode', sib.barcode,
        'imei', sib.imei,
        'pickupPrices', COALESCE(sib.pickup_prices, '{}'::jsonb),
        'pricingPolicy', sib.pricing_policy
      ));
    END LOOP;

    UPDATE stock_items
    SET variations = var_array,
        qty = (SELECT COALESCE(sum(qty), 0) FROM stock_items WHERE store_id = grp.store_id AND lower(trim(name)) = grp.norm_name),
        updated_at = now()
    WHERE id = master_id;

    -- Re-aponta chaves estrangeiras de irmãos para o master antes de excluir
    UPDATE sales_order_lines SET stock_item_id = master_id WHERE stock_item_id IN (SELECT id FROM stock_items WHERE store_id = grp.store_id AND lower(trim(name)) = grp.norm_name AND id <> master_id);
    UPDATE sales_order_lines SET stock_id = master_id WHERE stock_id IN (SELECT id FROM stock_items WHERE store_id = grp.store_id AND lower(trim(name)) = grp.norm_name AND id <> master_id);
    UPDATE stock_movements SET stock_item_id = master_id WHERE stock_item_id IN (SELECT id FROM stock_items WHERE store_id = grp.store_id AND lower(trim(name)) = grp.norm_name AND id <> master_id);
    UPDATE stock_movements SET stock_id = master_id WHERE stock_id IN (SELECT id FROM stock_items WHERE store_id = grp.store_id AND lower(trim(name)) = grp.norm_name AND id <> master_id);
    UPDATE stock_invoice_lines SET stock_item_id = master_id WHERE stock_item_id IN (SELECT id FROM stock_items WHERE store_id = grp.store_id AND lower(trim(name)) = grp.norm_name AND id <> master_id);
    UPDATE stock_invoice_lines SET stock_id = master_id WHERE stock_id IN (SELECT id FROM stock_items WHERE store_id = grp.store_id AND lower(trim(name)) = grp.norm_name AND id <> master_id);
    UPDATE pickup_requests SET stock_id = master_id WHERE stock_id IN (SELECT id FROM stock_items WHERE store_id = grp.store_id AND lower(trim(name)) = grp.norm_name AND id <> master_id);

    DELETE FROM stock_items
    WHERE store_id = grp.store_id AND lower(trim(name)) = grp.norm_name AND id <> master_id;
  END LOOP;
END $$;

-- Preencher a tabela Detail stock_item_variations a partir do campo variations
DO $$
DECLARE
  item RECORD;
  var_elem JSONB;
BEGIN
  FOR item IN SELECT id, store_id, variations FROM stock_items WHERE jsonb_array_length(variations) > 0 LOOP
    FOR var_elem IN SELECT * FROM jsonb_array_elements(item.variations) LOOP
      INSERT INTO stock_item_variations (
        id, store_id, stock_item_id, attrs, price, cost, avg_cost, qty, min_qty,
        card_rate, condition, barcode, imei, pickup_prices, pricing_policy
      ) VALUES (
        COALESCE(var_elem->>'id', 'var_' || md5(random()::text || clock_timestamp()::text)),
        item.store_id,
        item.id,
        COALESCE(var_elem->'attrs', '{}'::jsonb),
        COALESCE((var_elem->>'price')::numeric, 0),
        COALESCE((var_elem->>'cost')::numeric, 0),
        COALESCE((var_elem->>'avgCost')::numeric, (var_elem->>'cost')::numeric, 0),
        COALESCE((var_elem->>'qty')::int, 0),
        COALESCE((var_elem->>'minQty')::int, 0),
        (var_elem->>'cardRate')::numeric,
        COALESCE(var_elem->>'condition', 'new'),
        COALESCE(var_elem->>'barcode', ''),
        COALESCE(var_elem->>'imei', ''),
        COALESCE(var_elem->'pickupPrices', '{}'::jsonb),
        var_elem->'pricingPolicy'
      ) ON CONFLICT (id) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;
