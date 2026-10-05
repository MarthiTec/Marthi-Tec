-- Migration 0050: Restaurar dados operacionais da Cell Ponto, catalogo de produtos, atributos e correcao de ramo
DO $$
DECLARE
  v_cellponto_account_id TEXT;
  v_cellponto_store_id TEXT := 'STR-CELL-PONTO';
  v_demo_store_id TEXT := 'STR-DEMO-01';
  v_gilvan_id TEXT;
  v_marina_id TEXT;
  v_admin_id TEXT;
  v_marthi_user_id TEXT;
BEGIN
  -- 1. Assegurar colunas e tabelas essenciais
  ALTER TABLE stores ADD COLUMN IF NOT EXISTS segment TEXT NOT NULL DEFAULT 'assistencia_tecnica';
  ALTER TABLE stores ADD COLUMN IF NOT EXISTS attribute_automation_enabled BOOLEAN NOT NULL DEFAULT true;

  CREATE TABLE IF NOT EXISTS commercial_store_customization (
    store_id TEXT PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
    settings JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS commercial_profiles (
    store_id TEXT PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
    segment_id TEXT NOT NULL,
    settings JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- Em ambientes de teste limpos (sem lojas nem contas prévias), não poluir com seeds operacionais
  IF NOT EXISTS (SELECT 1 FROM stores) 
     AND NOT EXISTS (SELECT 1 FROM client_accounts) 
     AND NOT EXISTS (SELECT 1 FROM partner_signups) THEN
    RETURN;
  END IF;

  -- 2. Localizar ou assegurar conta contratante da Cell Ponto
  -- Prioridade máxima: usar o client_account_id que a própria loja já possui
  SELECT client_account_id INTO v_cellponto_account_id
  FROM stores
  WHERE id = v_cellponto_store_id OR (trade_name ILIKE '%Cell Ponto%' AND id <> v_demo_store_id)
  ORDER BY (id = v_cellponto_store_id) DESC
  LIMIT 1;

  IF v_cellponto_account_id IS NULL THEN
    SELECT id INTO v_cellponto_account_id
    FROM client_accounts
    WHERE trade_name ILIKE '%Cell Ponto%'
       OR email IN ('marinaveigatav@gmail.com', 'gilvanteodo@gmail.com')
       OR id IN ('PRT-CELL-PONTO', 'PRT-MUM5YWBG8DSR')
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_cellponto_account_id IS NULL THEN
    v_cellponto_account_id := 'PRT-CELL-PONTO';
    INSERT INTO client_accounts(id, legal_name, trade_name, document_type, document, email, phone, contact_name, status, created_at, updated_at)
    VALUES(v_cellponto_account_id, 'Cell Ponto Manutenção e Comércio LTDA', 'Cell Ponto', 'cnpj', '33.444.555/0001-66', 'marinaveigatav@gmail.com', '(11) 99999-9999', 'Gilvan Teodoro', 'active', now(), now())
    ON CONFLICT (id) DO UPDATE SET status = 'active', updated_at = now();
  ELSE
    UPDATE client_accounts 
    SET trade_name = 'Cell Ponto',
        legal_name = 'Cell Ponto Manutenção e Comércio LTDA',
        status = 'active',
        updated_at = now()
    WHERE id = v_cellponto_account_id;
  END IF;

  -- 3. Localizar ou assegurar loja matriz Cell Ponto
  IF NOT EXISTS (SELECT 1 FROM stores WHERE id = v_cellponto_store_id) THEN
    -- Verifica se havia loja da Cell Ponto com outro ID
    SELECT id INTO v_cellponto_store_id
    FROM stores
    WHERE trade_name ILIKE '%Cell Ponto%' AND id <> v_demo_store_id
    LIMIT 1;

    IF v_cellponto_store_id IS NULL THEN
      v_cellponto_store_id := 'STR-CELL-PONTO';
      INSERT INTO stores(id, client_account_id, legal_name, trade_name, document_type, document, email, phone, is_matrix, active, segment, created_at, updated_at)
      VALUES(v_cellponto_store_id, v_cellponto_account_id, 'Cell Ponto Manutenção e Comércio LTDA', 'Cell Ponto', 'cnpj', '33.444.555/0001-66', 'marinaveigatav@gmail.com', '(11) 99999-9999', true, true, 'assistencia_tecnica', now(), now())
      ON CONFLICT (id) DO UPDATE SET active = true, segment = 'assistencia_tecnica', updated_at = now();
    END IF;
  END IF;

  UPDATE stores
  SET trade_name = 'Cell Ponto',
      legal_name = 'Cell Ponto Manutenção e Comércio LTDA',
      segment = 'assistencia_tecnica',
      active = true,
      is_matrix = true,
      updated_at = now()
  WHERE id = v_cellponto_store_id;

  -- Garante licença ativa para Cell Ponto
  INSERT INTO store_licenses(id, client_account_id, store_id, plan_id, status, starts_at, modules, final_price, created_at, updated_at)
  VALUES(gen_random_uuid()::text, v_cellponto_account_id, v_cellponto_store_id, 'golden', 'active', now(), ARRAY['totem','pdv','os','erp','fiscal','ecommerce']::text[], 597, now(), now())
  ON CONFLICT (store_id) DO UPDATE SET status = 'active', updated_at = now();

  -- 4. Copiar dados que estejam erroneamente vinculados apenas à outra loja
  IF EXISTS (SELECT 1 FROM stores WHERE id = v_demo_store_id) THEN
    -- Atributos de produto
    INSERT INTO product_attributes(id, store_id, name, use_on_totem, filter_on_totem, use_on_stock, use_on_pdv, use_on_external_sale, sort, active)
    SELECT 'ATTR-' || substr(md5(v_cellponto_store_id || ':' || pa.name), 1, 16),
           v_cellponto_store_id, pa.name, pa.use_on_totem, pa.filter_on_totem, pa.use_on_stock, pa.use_on_pdv, pa.use_on_external_sale, pa.sort, true
    FROM product_attributes pa
    WHERE pa.store_id = v_demo_store_id
      AND NOT EXISTS (
        SELECT 1 FROM product_attributes target 
        WHERE target.store_id = v_cellponto_store_id AND lower(trim(target.name)) = lower(trim(pa.name))
      )
    ON CONFLICT (id) DO NOTHING;

    -- Valores de atributos
    INSERT INTO product_attribute_values(id, attribute_id, value, price_delta, sort)
    SELECT 'VAL-' || substr(md5(target_attr.id || ':' || pav.value), 1, 16),
           target_attr.id, pav.value, pav.price_delta, pav.sort
    FROM product_attribute_values pav
    JOIN product_attributes source_attr ON source_attr.id = pav.attribute_id
    JOIN product_attributes target_attr ON target_attr.store_id = v_cellponto_store_id AND lower(trim(target_attr.name)) = lower(trim(source_attr.name))
    WHERE source_attr.store_id = v_demo_store_id
    ON CONFLICT (attribute_id, value) DO NOTHING;

    -- Copiar produtos de stock_items se não existirem na Cell Ponto
    INSERT INTO stock_items(
      id, store_id, name, sku, barcode, imei, unit, qty, min_qty, cost, price, kind, condition, category, brand, attrs, color, capacity, card_rate, show_on_totem, images, variations, active, created_at, updated_at
    )
    SELECT 'STK-' || substr(md5(v_cellponto_store_id || ':' || si.name || ':' || si.sku), 1, 16),
           v_cellponto_store_id, si.name, si.sku, si.barcode, si.imei, si.unit, si.qty, si.min_qty, si.cost, si.price, si.kind, si.condition, si.category, si.brand, si.attrs, si.color, si.capacity, si.card_rate, si.show_on_totem, si.images, si.variations, true, now(), now()
    FROM stock_items si
    WHERE si.store_id = v_demo_store_id
      AND NOT EXISTS (
        SELECT 1 FROM stock_items target
        WHERE target.store_id = v_cellponto_store_id AND lower(trim(target.name)) = lower(trim(si.name))
      )
    ON CONFLICT DO NOTHING;
  END IF;

  -- 5. Garantir Atributos Oficiais de Assistência & Smartphones na Cell Ponto
  -- Atributo Cor
  INSERT INTO product_attributes(id, store_id, name, use_on_totem, filter_on_totem, use_on_stock, use_on_pdv, use_on_external_sale, sort, active)
  VALUES('ATTR-COR-CELLPONTO', v_cellponto_store_id, 'Cor', true, true, true, true, true, 1, true)
  ON CONFLICT (id) DO UPDATE SET active = true, use_on_totem = true, filter_on_totem = true;

  INSERT INTO product_attribute_values(id, attribute_id, value, price_delta, sort) VALUES
    ('VAL-COR-CP-01', 'ATTR-COR-CELLPONTO', 'Preto', 0, 1),
    ('VAL-COR-CP-02', 'ATTR-COR-CELLPONTO', 'Branco', 0, 2),
    ('VAL-COR-CP-03', 'ATTR-COR-CELLPONTO', 'Azul', 0, 3),
    ('VAL-COR-CP-04', 'ATTR-COR-CELLPONTO', 'Desert', 0, 4),
    ('VAL-COR-CP-05', 'ATTR-COR-CELLPONTO', 'Titânio Natural', 0, 5),
    ('VAL-COR-CP-06', 'ATTR-COR-CELLPONTO', 'Prata', 0, 6),
    ('VAL-COR-CP-07', 'ATTR-COR-CELLPONTO', 'Dourado', 0, 7),
    ('VAL-COR-CP-08', 'ATTR-COR-CELLPONTO', 'Grafite', 0, 8),
    ('VAL-COR-CP-09', 'ATTR-COR-CELLPONTO', 'Verde', 0, 9),
    ('VAL-COR-CP-10', 'ATTR-COR-CELLPONTO', 'Rosa', 0, 10),
    ('VAL-COR-CP-11', 'ATTR-COR-CELLPONTO', 'Roxo', 0, 11)
  ON CONFLICT (attribute_id, value) DO UPDATE SET sort = EXCLUDED.sort;

  -- Atributo Capacidade
  INSERT INTO product_attributes(id, store_id, name, use_on_totem, filter_on_totem, use_on_stock, use_on_pdv, use_on_external_sale, sort, active)
  VALUES('ATTR-CAP-CELLPONTO', v_cellponto_store_id, 'Capacidade', true, true, true, true, true, 2, true)
  ON CONFLICT (id) DO UPDATE SET active = true, use_on_totem = true, filter_on_totem = true;

  INSERT INTO product_attribute_values(id, attribute_id, value, price_delta, sort) VALUES
    ('VAL-CAP-CP-01', 'ATTR-CAP-CELLPONTO', '64 GB', 0, 1),
    ('VAL-CAP-CP-02', 'ATTR-CAP-CELLPONTO', '128 GB', 0, 2),
    ('VAL-CAP-CP-03', 'ATTR-CAP-CELLPONTO', '256 GB', 0, 3),
    ('VAL-CAP-CP-04', 'ATTR-CAP-CELLPONTO', '512 GB', 0, 4),
    ('VAL-CAP-CP-05', 'ATTR-CAP-CELLPONTO', '1 TB', 0, 5)
  ON CONFLICT (attribute_id, value) DO UPDATE SET sort = EXCLUDED.sort;

  -- Atributo Tipo de Retirada
  INSERT INTO product_attributes(id, store_id, name, use_on_totem, filter_on_totem, use_on_stock, use_on_pdv, use_on_external_sale, sort, active)
  VALUES('ATTR-RET-CELLPONTO', v_cellponto_store_id, 'Tipo de Retirada', true, false, true, true, true, 3, true)
  ON CONFLICT (id) DO UPDATE SET active = true;

  INSERT INTO product_attribute_values(id, attribute_id, value, price_delta, sort) VALUES
    ('VAL-RET-CP-01', 'ATTR-RET-CELLPONTO', 'Em mãos', 0, 1),
    ('VAL-RET-CP-02', 'ATTR-RET-CELLPONTO', 'Por encomenda', 0, 2)
  ON CONFLICT (attribute_id, value) DO UPDATE SET sort = EXCLUDED.sort;

  -- 6. Garantir Métodos de Retirada (pickup_methods)
  INSERT INTO pickup_methods(id, store_id, name, kind, active) VALUES
    ('PICK-' || md5(v_cellponto_store_id || 'immediate'), v_cellponto_store_id, 'Em mãos', 'immediate', true),
    ('PICK-' || md5(v_cellponto_store_id || 'order'), v_cellponto_store_id, 'Sob encomenda', 'order', true),
    ('PICK-' || md5(v_cellponto_store_id || 'delivery'), v_cellponto_store_id, 'Delivery', 'delivery', true)
  ON CONFLICT DO NOTHING;

  -- 7. Garantir Tabelas de Preço (price_tables)
  INSERT INTO price_tables(id, store_id, name, percent, active) VALUES
    ('TAB-CP-VISTA', v_cellponto_store_id, 'À vista', 0, true),
    ('TAB-CP-ATACADO', v_cellponto_store_id, 'Atacado', -8, true),
    ('TAB-CP-CARTAO', v_cellponto_store_id, 'Cartão', 5, true)
  ON CONFLICT (id) DO UPDATE SET percent = EXCLUDED.percent, active = true;

  -- 8. Garantir Formas de Pagamento (payment_methods)
  INSERT INTO payment_methods(id, store_id, name, type, price_table_id, max_installments, active) VALUES
    ('PAY-CP-CASH', v_cellponto_store_id, 'Dinheiro', 'cash', 'TAB-CP-VISTA', 1, true),
    ('PAY-CP-PIX', v_cellponto_store_id, 'Pix', 'pix', 'TAB-CP-VISTA', 1, true),
    ('PAY-CP-DEBIT', v_cellponto_store_id, 'Cartão de débito', 'debit', 'TAB-CP-VISTA', 1, true),
    ('PAY-CP-CREDIT', v_cellponto_store_id, 'Cartão de crédito', 'credit', 'TAB-CP-CARTAO', 18, true)
  ON CONFLICT (id) DO UPDATE SET active = true, max_installments = EXCLUDED.max_installments;

  -- 9. Garantir Taxas de Cartão da Maquininha Cell Ponto (store_module_state)
  INSERT INTO store_module_state(store_id, module_key, data, revision, updated_by)
  SELECT
    v_cellponto_store_id,
    'card-rates',
    '[{"id":"MACH-DEFAULT-01","name":"Maquininha Principal (Loja)","model":"Smart POS","isDefaultTotem":true,"defaultBrandId":"master","brands":[{"id":"master","name":"Mastercard","debitRate":1.39,"installments":[{"installment":1,"rate":3.14},{"installment":2,"rate":5.28},{"installment":3,"rate":6.45},{"installment":4,"rate":7.6},{"installment":5,"rate":8.75},{"installment":6,"rate":9.9},{"installment":7,"rate":11.05},{"installment":8,"rate":12.2},{"installment":9,"rate":13.35},{"installment":10,"rate":14.5},{"installment":11,"rate":15.65},{"installment":12,"rate":16.8}],"active":true},{"id":"visa","name":"Visa","debitRate":1.39,"installments":[{"installment":1,"rate":3.14},{"installment":2,"rate":5.28},{"installment":3,"rate":6.45},{"installment":4,"rate":7.6},{"installment":5,"rate":8.75},{"installment":6,"rate":9.9},{"installment":7,"rate":11.05},{"installment":8,"rate":12.2},{"installment":9,"rate":13.35},{"installment":10,"rate":14.5},{"installment":11,"rate":15.65},{"installment":12,"rate":16.8}],"active":true},{"id":"elo","name":"Elo","debitRate":1.85,"installments":[{"installment":1,"rate":3.8},{"installment":2,"rate":5.95},{"installment":3,"rate":7.1},{"installment":4,"rate":8.25},{"installment":5,"rate":9.4},{"installment":6,"rate":10.55},{"installment":7,"rate":11.7},{"installment":8,"rate":12.85},{"installment":9,"rate":14},{"installment":10,"rate":15.15},{"installment":11,"rate":16.3},{"installment":12,"rate":17.45}],"active":true},{"id":"hipercard","name":"Hipercard","debitRate":1.99,"installments":[{"installment":1,"rate":3.99},{"installment":2,"rate":6.15},{"installment":3,"rate":7.3},{"installment":4,"rate":8.45},{"installment":5,"rate":9.6},{"installment":6,"rate":10.75},{"installment":7,"rate":11.9},{"installment":8,"rate":13.05},{"installment":9,"rate":14.2},{"installment":10,"rate":15.35},{"installment":11,"rate":16.5},{"installment":12,"rate":17.65}],"active":true},{"id":"amex","name":"American Express","debitRate":2.2,"installments":[{"installment":1,"rate":4.2},{"installment":2,"rate":6.4},{"installment":3,"rate":7.55},{"installment":4,"rate":8.7},{"installment":5,"rate":9.85},{"installment":6,"rate":11},{"installment":7,"rate":12.15},{"installment":8,"rate":13.3},{"installment":9,"rate":14.45},{"installment":10,"rate":15.6},{"installment":11,"rate":16.75},{"installment":12,"rate":17.9}],"active":true}],"active":true,"createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-10-04T14:35:43.752Z"}]'::jsonb,
    1,
    u.id
  FROM users u
  ORDER BY u.created_at ASC
  LIMIT 1
  ON CONFLICT (store_id, module_key) DO UPDATE
  SET data = EXCLUDED.data, updated_at = now();

  -- 10. Garantir Customização Comercial e Ramo da Loja Cell Ponto
  INSERT INTO commercial_store_customization(store_id, settings)
  VALUES(
    v_cellponto_store_id,
    jsonb_build_object(
      'segmentId', 'assistencia_tecnica',
      'segmentName', 'Oficina, Assistência Técnica & Acessórios',
      'showCardRates', true,
      'showImei', true,
      'showDevicePassword', true,
      'showTablesAndKitchen', false,
      'showCardapioDigital', false,
      'showTechnicalBench', true,
      'showSizeColorGrid', false
    )
  )
  ON CONFLICT (store_id) DO UPDATE
  SET settings = EXCLUDED.settings, updated_at = now();

  INSERT INTO commercial_profiles(store_id, segment_id, settings)
  VALUES(
    v_cellponto_store_id,
    'assistencia_tecnica',
    jsonb_build_object(
      'segmentId', 'assistencia_tecnica',
      'enabled', true,
      'appleRules', true,
      'tradeIn', true,
      'supplierComparison', true,
      'catalog', true,
      'readyMarkup', 25,
      'orderMarkup', 18,
      'upgradeMarkup', 15,
      'usedWarrantyMonths', 3,
      'readyUsedWarrantyMonths', 3,
      'receiptDays', jsonb_build_array(1, 2, 3, 4, 5),
      'arrivalTime', '10:00',
      'cutoffTime', '16:00',
      'routes', jsonb_build_array('Entrega Expressa', 'Retirada em Mãos'),
      'categories', jsonb_build_array('iphone', 'xiaomi', 'pecas', 'acessorios')
    )
  )
  ON CONFLICT (store_id) DO UPDATE
  SET settings = EXCLUDED.settings, updated_at = now();

  -- 11. Garantir Catálogo Completo de Smartphones, Peças e Acessórios Cell Ponto
  -- 11.1 iPhone 16 Pro Max
  IF NOT EXISTS (SELECT 1 FROM stock_items WHERE store_id = v_cellponto_store_id AND lower(trim(name)) = 'iphone 16 pro max') THEN
    INSERT INTO stock_items(
      id, store_id, name, sku, kind, condition, category, brand, color, capacity, cost, price, qty, min_qty, card_rate, show_on_totem, variations, active
    ) VALUES (
      'STK-CP-IPH16PM', v_cellponto_store_id, 'iPhone 16 Pro Max', 'APPLE-IPHONE16PROMAX-NEW', 'device', 'new', 'iphone', 'apple', 'Desert', '256 GB', 5900, 6990, 7, 1, 16.8, true,
      '[
        {"id":"VAR-CP-16PM-01","attrs":{"ATTR-COR-CELLPONTO":"Desert","ATTR-CAP-CELLPONTO":"256 GB"},"price":6990,"cost":5900,"avgCost":5900,"qty":3,"minQty":1,"cardRate":16.8,"condition":"new","barcode":"","imei":""},
        {"id":"VAR-CP-16PM-02","attrs":{"ATTR-COR-CELLPONTO":"Preto","ATTR-CAP-CELLPONTO":"256 GB"},"price":6990,"cost":5900,"avgCost":5900,"qty":2,"minQty":1,"cardRate":16.8,"condition":"new","barcode":"","imei":""},
        {"id":"VAR-CP-16PM-03","attrs":{"ATTR-COR-CELLPONTO":"Titânio Natural","ATTR-CAP-CELLPONTO":"256 GB"},"price":6990,"cost":5900,"avgCost":5900,"qty":2,"minQty":1,"cardRate":16.8,"condition":"new","barcode":"","imei":""}
      ]'::jsonb,
      true
    );
  END IF;

  -- 11.2 iPhone 16 Pro
  IF NOT EXISTS (SELECT 1 FROM stock_items WHERE store_id = v_cellponto_store_id AND lower(trim(name)) = 'iphone 16 pro') THEN
    INSERT INTO stock_items(
      id, store_id, name, sku, kind, condition, category, brand, color, capacity, cost, price, qty, min_qty, card_rate, show_on_totem, variations, active
    ) VALUES (
      'STK-CP-IPH16P', v_cellponto_store_id, 'iPhone 16 Pro', 'APPLE-IPHONE16PRO-NEW', 'device', 'new', 'iphone', 'apple', 'Preto', '128 GB', 5300, 6290, 8, 1, 16.8, true,
      '[
        {"id":"VAR-CP-16P-01","attrs":{"ATTR-COR-CELLPONTO":"Preto","ATTR-CAP-CELLPONTO":"128 GB"},"price":6290,"cost":5300,"avgCost":5300,"qty":3,"minQty":1,"cardRate":16.8,"condition":"new","barcode":"","imei":""},
        {"id":"VAR-CP-16P-02","attrs":{"ATTR-COR-CELLPONTO":"Branco","ATTR-CAP-CELLPONTO":"128 GB"},"price":6290,"cost":5300,"avgCost":5300,"qty":2,"minQty":1,"cardRate":16.8,"condition":"new","barcode":"","imei":""},
        {"id":"VAR-CP-16P-03","attrs":{"ATTR-COR-CELLPONTO":"Desert","ATTR-CAP-CELLPONTO":"256 GB"},"price":6890,"cost":5800,"avgCost":5800,"qty":2,"minQty":1,"cardRate":16.8,"condition":"new","barcode":"","imei":""},
        {"id":"VAR-CP-16P-04","attrs":{"ATTR-COR-CELLPONTO":"Titânio Natural","ATTR-CAP-CELLPONTO":"256 GB"},"price":6890,"cost":5800,"avgCost":5800,"qty":1,"minQty":1,"cardRate":16.8,"condition":"new","barcode":"","imei":""}
      ]'::jsonb,
      true
    );
  END IF;

  -- 11.3 iPhone 15 Pro Max
  IF NOT EXISTS (SELECT 1 FROM stock_items WHERE store_id = v_cellponto_store_id AND lower(trim(name)) = 'iphone 15 pro max') THEN
    INSERT INTO stock_items(
      id, store_id, name, sku, kind, condition, category, brand, color, capacity, cost, price, qty, min_qty, card_rate, show_on_totem, variations, active
    ) VALUES (
      'STK-CP-IPH15PM', v_cellponto_store_id, 'iPhone 15 Pro Max', 'APPLE-IPHONE15PROMAX-NEW', 'device', 'new', 'iphone', 'apple', 'Titânio Natural', '256 GB', 4900, 5890, 5, 1, 16.8, true,
      '[
        {"id":"VAR-CP-15PM-01","attrs":{"ATTR-COR-CELLPONTO":"Titânio Natural","ATTR-CAP-CELLPONTO":"256 GB"},"price":5890,"cost":4900,"avgCost":4900,"qty":3,"minQty":1,"cardRate":16.8,"condition":"new","barcode":"","imei":""},
        {"id":"VAR-CP-15PM-02","attrs":{"ATTR-COR-CELLPONTO":"Azul","ATTR-CAP-CELLPONTO":"256 GB"},"price":5890,"cost":4900,"avgCost":4900,"qty":2,"minQty":1,"cardRate":16.8,"condition":"new","barcode":"","imei":""}
      ]'::jsonb,
      true
    );
  END IF;

  -- 11.4 iPhone 15
  IF NOT EXISTS (SELECT 1 FROM stock_items WHERE store_id = v_cellponto_store_id AND lower(trim(name)) = 'iphone 15') THEN
    INSERT INTO stock_items(
      id, store_id, name, sku, kind, condition, category, brand, color, capacity, cost, price, qty, min_qty, card_rate, show_on_totem, variations, active
    ) VALUES (
      'STK-CP-IPH15', v_cellponto_store_id, 'iPhone 15', 'APPLE-IPHONE15-NEW', 'device', 'new', 'iphone', 'apple', 'Preto', '128 GB', 3800, 4499, 11, 1, 16.8, true,
      '[
        {"id":"VAR-CP-15-01","attrs":{"ATTR-COR-CELLPONTO":"Preto","ATTR-CAP-CELLPONTO":"128 GB"},"price":4499,"cost":3800,"avgCost":3800,"qty":4,"minQty":1,"cardRate":16.8,"condition":"new","barcode":"","imei":""},
        {"id":"VAR-CP-15-02","attrs":{"ATTR-COR-CELLPONTO":"Azul","ATTR-CAP-CELLPONTO":"128 GB"},"price":4499,"cost":3800,"avgCost":3800,"qty":3,"minQty":1,"cardRate":16.8,"condition":"new","barcode":"","imei":""},
        {"id":"VAR-CP-15-03","attrs":{"ATTR-COR-CELLPONTO":"Rosa","ATTR-CAP-CELLPONTO":"128 GB"},"price":4499,"cost":3800,"avgCost":3800,"qty":2,"minQty":1,"cardRate":16.8,"condition":"new","barcode":"","imei":""},
        {"id":"VAR-CP-15-04","attrs":{"ATTR-COR-CELLPONTO":"Preto","ATTR-CAP-CELLPONTO":"256 GB"},"price":5099,"cost":4300,"avgCost":4300,"qty":2,"minQty":1,"cardRate":16.8,"condition":"new","barcode":"","imei":""}
      ]'::jsonb,
      true
    );
  END IF;

  -- 11.5 iPhone 14
  IF NOT EXISTS (SELECT 1 FROM stock_items WHERE store_id = v_cellponto_store_id AND lower(trim(name)) = 'iphone 14') THEN
    INSERT INTO stock_items(
      id, store_id, name, sku, kind, condition, category, brand, color, capacity, cost, price, qty, min_qty, card_rate, show_on_totem, variations, active
    ) VALUES (
      'STK-CP-IPH14', v_cellponto_store_id, 'iPhone 14', 'APPLE-IPHONE14-NEW', 'device', 'new', 'iphone', 'apple', 'Preto', '128 GB', 3200, 3899, 7, 1, 16.8, true,
      '[
        {"id":"VAR-CP-14-01","attrs":{"ATTR-COR-CELLPONTO":"Preto","ATTR-CAP-CELLPONTO":"128 GB"},"price":3899,"cost":3200,"avgCost":3200,"qty":4,"minQty":1,"cardRate":16.8,"condition":"new","barcode":"","imei":""},
        {"id":"VAR-CP-14-02","attrs":{"ATTR-COR-CELLPONTO":"Azul","ATTR-CAP-CELLPONTO":"128 GB"},"price":3899,"cost":3200,"avgCost":3200,"qty":2,"minQty":1,"cardRate":16.8,"condition":"new","barcode":"","imei":""},
        {"id":"VAR-CP-14-03","attrs":{"ATTR-COR-CELLPONTO":"Roxo","ATTR-CAP-CELLPONTO":"256 GB"},"price":4399,"cost":3600,"avgCost":3600,"qty":1,"minQty":1,"cardRate":16.8,"condition":"new","barcode":"","imei":""}
      ]'::jsonb,
      true
    );
  END IF;

  -- 11.6 iPhone 13
  IF NOT EXISTS (SELECT 1 FROM stock_items WHERE store_id = v_cellponto_store_id AND lower(trim(name)) = 'iphone 13') THEN
    INSERT INTO stock_items(
      id, store_id, name, sku, kind, condition, category, brand, color, capacity, cost, price, qty, min_qty, card_rate, show_on_totem, variations, active
    ) VALUES (
      'STK-CP-IPH13', v_cellponto_store_id, 'iPhone 13', 'APPLE-IPHONE13-NEW', 'device', 'new', 'iphone', 'apple', 'Preto', '128 GB', 2800, 3400, 10, 1, 16.8, true,
      '[
        {"id":"VAR-CP-13-01","attrs":{"ATTR-COR-CELLPONTO":"Preto","ATTR-CAP-CELLPONTO":"128 GB"},"price":3400,"cost":2800,"avgCost":2800,"qty":5,"minQty":1,"cardRate":16.8,"condition":"new","barcode":"","imei":""},
        {"id":"VAR-CP-13-02","attrs":{"ATTR-COR-CELLPONTO":"Branco","ATTR-CAP-CELLPONTO":"128 GB"},"price":3400,"cost":2800,"avgCost":2800,"qty":3,"minQty":1,"cardRate":16.8,"condition":"new","barcode":"","imei":""},
        {"id":"VAR-CP-13-03","attrs":{"ATTR-COR-CELLPONTO":"Azul","ATTR-CAP-CELLPONTO":"128 GB"},"price":3400,"cost":2800,"avgCost":2800,"qty":2,"minQty":1,"cardRate":16.8,"condition":"new","barcode":"","imei":""}
      ]'::jsonb,
      true
    );
  END IF;

  -- 11.7 iPhone 12
  IF NOT EXISTS (SELECT 1 FROM stock_items WHERE store_id = v_cellponto_store_id AND lower(trim(name)) = 'iphone 12') THEN
    INSERT INTO stock_items(
      id, store_id, name, sku, kind, condition, category, brand, color, capacity, cost, price, qty, min_qty, card_rate, show_on_totem, variations, active
    ) VALUES (
      'STK-CP-IPH12', v_cellponto_store_id, 'iPhone 12', 'APPLE-IPHONE12-NEW', 'device', 'new', 'iphone', 'apple', 'Preto', '64 GB', 2200, 2799, 6, 1, 16.8, true,
      '[
        {"id":"VAR-CP-12-01","attrs":{"ATTR-COR-CELLPONTO":"Preto","ATTR-CAP-CELLPONTO":"64 GB"},"price":2799,"cost":2200,"avgCost":2200,"qty":3,"minQty":1,"cardRate":16.8,"condition":"new","barcode":"","imei":""},
        {"id":"VAR-CP-12-02","attrs":{"ATTR-COR-CELLPONTO":"Branco","ATTR-CAP-CELLPONTO":"128 GB"},"price":3099,"cost":2500,"avgCost":2500,"qty":3,"minQty":1,"cardRate":16.8,"condition":"new","barcode":"","imei":""}
      ]'::jsonb,
      true
    );
  END IF;

  -- 11.8 iPhone 11
  IF NOT EXISTS (SELECT 1 FROM stock_items WHERE store_id = v_cellponto_store_id AND lower(trim(name)) = 'iphone 11') THEN
    INSERT INTO stock_items(
      id, store_id, name, sku, kind, condition, category, brand, color, capacity, cost, price, qty, min_qty, card_rate, show_on_totem, variations, active
    ) VALUES (
      'STK-CP-IPH11', v_cellponto_store_id, 'iPhone 11', 'APPLE-IPHONE11-NEW', 'device', 'new', 'iphone', 'apple', 'Preto', '64 GB', 1800, 2299, 6, 1, 16.8, true,
      '[
        {"id":"VAR-CP-11-01","attrs":{"ATTR-COR-CELLPONTO":"Preto","ATTR-CAP-CELLPONTO":"64 GB"},"price":2299,"cost":1800,"avgCost":1800,"qty":4,"minQty":1,"cardRate":16.8,"condition":"new","barcode":"","imei":""},
        {"id":"VAR-CP-11-02","attrs":{"ATTR-COR-CELLPONTO":"Branco","ATTR-CAP-CELLPONTO":"128 GB"},"price":2599,"cost":2050,"avgCost":2050,"qty":2,"minQty":1,"cardRate":16.8,"condition":"new","barcode":"","imei":""}
      ]'::jsonb,
      true
    );
  END IF;

  -- 11.9 Redmi Note 13 Pro
  IF NOT EXISTS (SELECT 1 FROM stock_items WHERE store_id = v_cellponto_store_id AND lower(trim(name)) = 'redmi note 13 pro') THEN
    INSERT INTO stock_items(
      id, store_id, name, sku, kind, condition, category, brand, color, capacity, cost, price, qty, min_qty, card_rate, show_on_totem, variations, active
    ) VALUES (
      'STK-CP-REDMI13P', v_cellponto_store_id, 'Redmi Note 13 Pro', 'XIAOMI-REDMINOTE13PRO-NEW', 'device', 'new', 'xiaomi', 'xiaomi', 'Preto', '256 GB', 1700, 2199, 9, 1, 16.8, true,
      '[
        {"id":"VAR-CP-RN13P-01","attrs":{"ATTR-COR-CELLPONTO":"Preto","ATTR-CAP-CELLPONTO":"256 GB"},"price":2199,"cost":1700,"avgCost":1700,"qty":4,"minQty":1,"cardRate":16.8,"condition":"new","barcode":"","imei":""},
        {"id":"VAR-CP-RN13P-02","attrs":{"ATTR-COR-CELLPONTO":"Verde","ATTR-CAP-CELLPONTO":"256 GB"},"price":2199,"cost":1700,"avgCost":1700,"qty":3,"minQty":1,"cardRate":16.8,"condition":"new","barcode":"","imei":""},
        {"id":"VAR-CP-RN13P-03","attrs":{"ATTR-COR-CELLPONTO":"Roxo","ATTR-CAP-CELLPONTO":"512 GB"},"price":2599,"cost":2000,"avgCost":2000,"qty":2,"minQty":1,"cardRate":16.8,"condition":"new","barcode":"","imei":""}
      ]'::jsonb,
      true
    );
  END IF;

  -- 11.10 Peças e Acessórios de Assistência Técnica
  INSERT INTO stock_items(id, store_id, name, sku, kind, condition, category, brand, cost, price, qty, min_qty, show_on_totem, active) VALUES
    ('STK-CP-TEL-IPH13', v_cellponto_store_id, 'Tela Frontal iPhone 13 Original Nacional', 'PEC-TELA-IPH13-ORIG', 'part', 'new', 'pecas', 'apple', 320, 580, 8, 2, false, true),
    ('STK-CP-TEL-IPH14P', v_cellponto_store_id, 'Tela Frontal iPhone 14 Pro Premium OLED', 'PEC-TELA-IPH14P-OLED', 'part', 'new', 'pecas', 'apple', 510, 890, 5, 1, false, true),
    ('STK-CP-BAT-IPH13', v_cellponto_store_id, 'Bateria iPhone 13 com Placa Flex Integrada', 'PEC-BAT-IPH13-FLEX', 'part', 'new', 'pecas', 'apple', 110, 240, 12, 3, false, true),
    ('STK-CP-CON-IPH12', v_cellponto_store_id, 'Conector de Carga / Microfone iPhone 12', 'PEC-CON-IPH12-DOC', 'part', 'new', 'pecas', 'apple', 65, 180, 6, 2, false, true),
    ('STK-CP-ACS-FONT20W', v_cellponto_store_id, 'Carregador Turbo 20W USB-C Homologado', 'ACS-FONT-20W-USBC', 'part', 'new', 'acessorios', 'apple', 45, 120, 20, 5, true, true),
    ('STK-CP-ACS-CABO1M', v_cellponto_store_id, 'Cabo USB-C para Lightning Reforçado 1m', 'ACS-CABO-LIGHT-1M', 'part', 'new', 'acessorios', 'apple', 22, 65, 25, 5, true, true),
    ('STK-CP-ACS-PEL3D', v_cellponto_store_id, 'Película de Vidro 3D / Cerâmica Privacidade', 'ACS-PEL-CERAM-3D', 'part', 'new', 'acessorios', 'geral', 8, 35, 50, 10, true, true),
    ('STK-CP-ACS-CAPACLR', v_cellponto_store_id, 'Capa Anti-Impacto Transparente MagSafe', 'ACS-CAPA-MAGSAFE-CLR', 'part', 'new', 'acessorios', 'apple', 25, 79, 18, 5, true, true)
  ON CONFLICT (id) DO UPDATE SET price = EXCLUDED.price, cost = EXCLUDED.cost, active = true;

  -- 12. Sincronizar stock_item_variations a partir do campo variations para a Cell Ponto
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stock_item_variations') THEN
    INSERT INTO stock_item_variations(
      id, store_id, stock_item_id, attrs, price, cost, avg_cost, qty, min_qty, card_rate, condition, barcode, imei, pickup_prices, pricing_policy, created_at, updated_at
    )
    SELECT
      COALESCE(elem->>'id', gen_random_uuid()::text),
      si.store_id,
      si.id,
      COALESCE(elem->'attrs', '{}'::jsonb),
      COALESCE((elem->>'price')::numeric, si.price),
      COALESCE((elem->>'cost')::numeric, si.cost),
      COALESCE((elem->>'avgCost')::numeric, si.cost),
      COALESCE((elem->>'qty')::int, si.qty),
      COALESCE((elem->>'minQty')::int, si.min_qty),
      (elem->>'cardRate')::numeric,
      COALESCE(elem->>'condition', si.condition::text),
      COALESCE(elem->>'barcode', ''),
      COALESCE(elem->>'imei', ''),
      COALESCE(elem->'pickupPrices', '{}'::jsonb),
      elem->'pricingPolicy',
      now(),
      now()
    FROM stock_items si
    CROSS JOIN jsonb_array_elements(si.variations) AS elem
    WHERE si.store_id = v_cellponto_store_id
      AND si.variations IS NOT NULL
      AND jsonb_array_length(si.variations) > 0
    ON CONFLICT (id) DO UPDATE
    SET price = EXCLUDED.price,
        cost = EXCLUDED.cost,
        qty = EXCLUDED.qty,
        attrs = EXCLUDED.attrs,
        updated_at = now();
  END IF;

  -- 13. Garantir Usuários Gilvan e Marina como Administradores da Loja Cell Ponto
  DELETE FROM user_stores WHERE user_id IN (
    SELECT id FROM users 
    WHERE lower(email) IN ('gilvanteodo@gmail.com', 'marinaveigatav@gmail.com')
      AND client_account_id IS DISTINCT FROM v_cellponto_account_id
  );
  DELETE FROM users 
  WHERE lower(email) IN ('gilvanteodo@gmail.com', 'marinaveigatav@gmail.com')
    AND client_account_id IS DISTINCT FROM v_cellponto_account_id;

  -- 13.1 Gilvan Teodoro
  SELECT id INTO v_gilvan_id FROM users WHERE lower(email) = 'gilvanteodo@gmail.com' AND client_account_id = v_cellponto_account_id;
  IF v_gilvan_id IS NULL THEN
    v_gilvan_id := gen_random_uuid()::text;
    INSERT INTO users(id, client_account_id, email, name, provider, global_role, active, created_at, updated_at)
    VALUES(v_gilvan_id, v_cellponto_account_id, 'gilvanteodo@gmail.com', 'Gilvan Teodoro', 'password', 'admin', true, now(), now());
  ELSE
    UPDATE users SET global_role = 'admin', active = true, updated_at = now() WHERE id = v_gilvan_id;
  END IF;

  INSERT INTO user_stores(id, user_id, store_id, role, is_default, created_at)
  VALUES(gen_random_uuid()::text, v_gilvan_id, v_cellponto_store_id, 'admin', true, now())
  ON CONFLICT (user_id, store_id) DO UPDATE SET role = 'admin', is_default = true;

  INSERT INTO employees(id, store_id, name, email, user_email, role, is_system_user, active)
  VALUES(gen_random_uuid()::text, v_cellponto_store_id, 'Gilvan Teodoro', 'gilvanteodo@gmail.com', 'gilvanteodo@gmail.com', 'admin', true, true)
  ON CONFLICT DO NOTHING;

  -- 13.2 Marina Veiga
  SELECT id INTO v_marina_id FROM users WHERE lower(email) = 'marinaveigatav@gmail.com' AND client_account_id = v_cellponto_account_id;
  IF v_marina_id IS NULL THEN
    v_marina_id := gen_random_uuid()::text;
    INSERT INTO users(id, client_account_id, email, name, provider, global_role, active, created_at, updated_at)
    VALUES(v_marina_id, v_cellponto_account_id, 'marinaveigatav@gmail.com', 'Marina Veiga', 'password', 'admin', true, now(), now());
  ELSE
    UPDATE users SET global_role = 'admin', active = true, updated_at = now() WHERE id = v_marina_id;
  END IF;

  INSERT INTO user_stores(id, user_id, store_id, role, is_default, created_at)
  VALUES(gen_random_uuid()::text, v_marina_id, v_cellponto_store_id, 'admin', false, now())
  ON CONFLICT (user_id, store_id) DO UPDATE SET role = 'admin';

  INSERT INTO employees(id, store_id, name, email, user_email, role, is_system_user, active)
  VALUES(gen_random_uuid()::text, v_cellponto_store_id, 'Marina Veiga', 'marinaveigatav@gmail.com', 'marinaveigatav@gmail.com', 'admin', true, true)
  ON CONFLICT DO NOTHING;

  -- 14. Vínculo de superadministradores do sistema (Marthi) para acesso transparente
  FOR v_admin_id IN (SELECT id FROM users WHERE global_role = 'superadmin' OR email IN ('marthi.tecnologia@gmail.com', 'teste@marthi.com.br')) LOOP
    BEGIN
      INSERT INTO user_stores(id, user_id, store_id, role, is_default, created_at)
      VALUES(gen_random_uuid()::text, v_admin_id, v_cellponto_store_id, 'admin', false, now())
      ON CONFLICT (user_id, store_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;

END $$;
