-- ============================================================================
-- Migration 0015: Ensure Stock Columns, Types, Store Links & Totem Catalog Seed
-- ============================================================================

-- 1. Garante compatibilidade de valores nos ENUMs
DO $$ BEGIN
  ALTER TYPE plan_id ADD VALUE IF NOT EXISTS 'bronze';
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE plan_id ADD VALUE IF NOT EXISTS 'silver';
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE plan_id ADD VALUE IF NOT EXISTS 'golden';
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE plan_id ADD VALUE IF NOT EXISTS 'scale';
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE module_id ADD VALUE IF NOT EXISTS 'totem';
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE module_id ADD VALUE IF NOT EXISTS 'os';
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE module_id ADD VALUE IF NOT EXISTS 'erp';
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE module_id ADD VALUE IF NOT EXISTS 'fiscal';
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE module_id ADD VALUE IF NOT EXISTS 'ecommerce';
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;

-- 2. Garante colunas essenciais na tabela stock_items
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'UN';
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Geral';
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS brand TEXT NOT NULL DEFAULT '';
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS attrs JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '';
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS capacity TEXT NOT NULL DEFAULT '';
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS card_rate NUMERIC(6,2) NOT NULL DEFAULT 0;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS show_on_totem BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_stock_items_totem ON stock_items(store_id, show_on_totem);
  CREATE INDEX IF NOT EXISTS idx_stock_items_active ON stock_items(store_id, active);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 3. Garante associação de teste@marthi.com.br e marthi.tecnologia@gmail.com com STR-DEMO-01
DO $$ BEGIN
  INSERT INTO user_stores (id, user_id, store_id, role, is_default, permissions)
  SELECT s.id, u.id, s.store_id, s.role, s.is_default, s.permissions
  FROM (
    VALUES
      ('UST-TEST-01', 'teste@marthi.com.br', 'STR-DEMO-01', 'admin', true, '{"all": true}'::jsonb),
      ('UST-MARTHI-01', 'marthi.tecnologia@gmail.com', 'STR-DEMO-01', 'admin', true, '{"all": true}'::jsonb)
  ) AS s(id, email, store_id, role, is_default, permissions)
  JOIN users u ON u.email = s.email
  ON CONFLICT (id) DO UPDATE SET role = 'admin', is_default = true;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 4. Garante colaboradores teste e marthi na tabela employees com role admin e acesso total
DO $$ BEGIN
  ALTER TABLE employees ALTER COLUMN access_areas DROP DEFAULT;
  ALTER TABLE employees ALTER COLUMN access_areas TYPE JSONB USING to_jsonb(access_areas);
  ALTER TABLE employees ALTER COLUMN access_areas SET DEFAULT '[]'::jsonb;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE employees ALTER COLUMN role DROP DEFAULT;
  ALTER TABLE employees ALTER COLUMN role TYPE TEXT USING role::TEXT;
  ALTER TABLE employees ALTER COLUMN role SET DEFAULT 'operator';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

INSERT INTO employees (id, store_id, name, phone, email, document, role, is_system_user, user_email, access_areas, active)
VALUES
  ('EMP-TESTE-ADMIN', 'STR-DEMO-01', 'Marthi Teste Admin', '(24) 98124-4253', 'teste@marthi.com.br', '', 'admin', true, 'teste@marthi.com.br', '["painel","totem","pdv","os","erp","fiscal","ecommerce"]'::jsonb, true),
  ('EMP-MARTHI-ADMIN', 'STR-DEMO-01', 'Marthi Tecnologia', '(24) 98124-4253', 'marthi.tecnologia@gmail.com', '', 'admin', true, 'marthi.tecnologia@gmail.com', '["painel","totem","pdv","os","erp","fiscal","ecommerce"]'::jsonb, true)
ON CONFLICT (id) DO UPDATE SET
  role = 'admin',
  is_system_user = true,
  access_areas = '["painel","totem","pdv","os","erp","fiscal","ecommerce"]'::jsonb,
  active = true;

-- 5. Garante licença de loja completa para STR-DEMO-01
DO $$ BEGIN
  INSERT INTO store_licenses (id, store_id, client_account_id, plan_id, modules, status)
  VALUES ('LIC-DEMO-01', 'STR-DEMO-01', 'ACC-MARTHI-DEMO', 'scale', ARRAY['totem', 'os', 'erp', 'fiscal', 'ecommerce']::module_id[], 'active')
  ON CONFLICT (store_id) DO UPDATE SET
    plan_id = 'scale',
    status = 'active',
    modules = ARRAY['totem', 'os', 'erp', 'fiscal', 'ecommerce']::module_id[];
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 6. Produtos Iniciais para Vitrine do Totem e ERP Cell Ponto
INSERT INTO stock_items (
  id, store_id, name, sku, barcode, imei, unit, qty, min_qty, cost, price,
  kind, condition, category, brand, active, attrs, color, capacity, card_rate, show_on_totem, images
)
SELECT
  p.id, 'STR-DEMO-01', p.name, p.sku, p.barcode, '', 'UN', p.qty, 1, p.cost, p.price,
  p.kind::stock_kind, 'new'::stock_condition, p.category, p.brand, true,
  p.attrs::jsonb, p.color, p.capacity, 12.0, true, p.images::jsonb
FROM (
  VALUES
    (
      'STK-IPHONE15-128',
      'iPhone 15 128GB Preto',
      'APL-15-128-BLK',
      '789123456001',
      5,
      3800.00,
      4799.00,
      'device',
      'Smartphones',
      'Apple',
      '{"Cor": "Preto", "Capacidade": "128 GB"}',
      'Preto',
      '128 GB',
      '["https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=600&auto=format&fit=crop&q=80"]'
    ),
    (
      'STK-IPHONE16P-128',
      'iPhone 16 Pro 128GB Titânio',
      'APL-16P-128-TIT',
      '789123456002',
      3,
      6500.00,
      7999.00,
      'device',
      'Smartphones',
      'Apple',
      '{"Cor": "Titânio Natural", "Capacidade": "128 GB"}',
      'Titânio Natural',
      '128 GB',
      '["https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=600&auto=format&fit=crop&q=80"]'
    ),
    (
      'STK-REDMI-NOTE13',
      'Xiaomi Redmi Note 13 256GB Azul',
      'XIA-RN13-256-BLU',
      '789123456003',
      8,
      1050.00,
      1499.00,
      'device',
      'Smartphones',
      'Xiaomi',
      '{"Cor": "Azul", "Capacidade": "256 GB"}',
      'Azul',
      '256 GB',
      '["https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=600&auto=format&fit=crop&q=80"]'
    ),
    (
      'STK-PELICULA-3D',
      'Película de Vidro 3D Privacidade',
      'ACC-PEL-3D-PRIV',
      '789123456004',
      30,
      8.00,
      49.90,
      'part',
      'Acessórios',
      'Premium',
      '{}',
      '',
      '',
      '["https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=600&auto=format&fit=crop&q=80"]'
    ),
    (
      'STK-CABO-USBC',
      'Cabo USB-C Turbo 20W Reforçado',
      'ACC-CAB-USBC-20W',
      '789123456005',
      25,
      15.00,
      79.90,
      'part',
      'Acessórios',
      'Geonav',
      '{}',
      '',
      '',
      '["https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=600&auto=format&fit=crop&q=80"]'
    ),
    (
      'STK-CARREGADOR-25W',
      'Carregador Rápido 25W Homologado Anatel',
      'ACC-CAR-25W-FAST',
      '789123456006',
      15,
      28.00,
      129.90,
      'part',
      'Acessórios',
      'Anker',
      '{}',
      '',
      '',
      '["https://images.unsplash.com/photo-1585338107529-13afc5f02586?w=600&auto=format&fit=crop&q=80"]'
    )
) AS p(id, name, sku, barcode, qty, cost, price, kind, category, brand, attrs, color, capacity, images)
ON CONFLICT (id) DO UPDATE SET
  show_on_totem = true,
  active = true;

-- 7. Limpeza definitiva de contas legadas de teste/mock
DELETE FROM user_stores WHERE user_id IN ('usr-mariana-cellponto', 'usr-gilvan-cellponto');
DELETE FROM employees WHERE user_email IN ('marianaveigatav@gmail.com', 'gilvanteodo@gmail.com', 'gilvancellponto@gmail.com');
DELETE FROM users WHERE email IN ('marianaveigatav@gmail.com', 'gilvanteodo@gmail.com', 'gilvancellponto@gmail.com');
