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

-- Preserve existing product identities and movement references. Consolidation requires explicit review.

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
