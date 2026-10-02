-- ============================================================================
-- 0008_mariana_cell_ponto_and_stock_attrs.sql
-- 1. Suporte completo a atributos JSONB, cor, capacidade, taxa de cartão e fotos no estoque
-- 2. Credenciais e vínculo da colaboradora Mariana Veiga (Cell Ponto)
-- ============================================================================

-- 1. Colunas estendidas para grade de variações e múltiplos atributos no estoque
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS attrs JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '';
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS capacity TEXT NOT NULL DEFAULT '';
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS card_rate NUMERIC(6,2) NOT NULL DEFAULT 0;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS show_on_totem BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb;

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

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_stock_items_totem ON stock_items(store_id, show_on_totem);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 2. Garantir conta cliente demo Cell Ponto
INSERT INTO client_accounts (id, trade_name, legal_name, document_type, document, email, phone, contact_name, status)
VALUES (
  'ACC-MARTHI-DEMO',
  'Cell Ponto Telecomunicações LTDA',
  'Cell Ponto Telecomunicações LTDA',
  'cnpj',
  '61.506.270/0001-63',
  'marthi.tecnologia@gmail.com',
  '(24) 98124-4253',
  'Matheus Marçal',
  'active'
)
ON CONFLICT (id) DO UPDATE SET
  trade_name = EXCLUDED.trade_name,
  status = 'active';

-- Garantir loja matriz Cell Ponto
INSERT INTO stores (
  id, client_account_id, trade_name, legal_name, document_type, document,
  state_registration, municipal_registration, email, phone, zip_code, street,
  number, complement, district, city, state, tax_regime, is_matrix, active,
  created_at, updated_at
)
VALUES (
  'STR-DEMO-01',
  'ACC-MARTHI-DEMO',
  'Cell Ponto Matriz',
  'Cell Ponto Telecomunicações LTDA',
  'cnpj',
  '61.506.270/0001-63',
  'ISENTO',
  '12345',
  'matriz@cellponto.com.br',
  '(24) 98124-4253',
  '25800-000',
  'Rua Prefeito Walter Franklin',
  '120',
  'Loja 01',
  'Centro',
  'Três Rios',
  'RJ',
  'simples_nacional',
  true,
  true,
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  trade_name = EXCLUDED.trade_name,
  active = true,
  updated_at = now();

-- 3. Inserir / atualizar usuária Mariana Veiga (senha 1234)
DO $$ BEGIN
  ALTER TABLE users ADD COLUMN IF NOT EXISTS store_id TEXT DEFAULT 'STR-DEMO-01';
  ALTER TABLE users ALTER COLUMN store_id DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

INSERT INTO users (id, client_account_id, store_id, email, name, provider, password_hash, global_role, active)
VALUES (
  'usr-mariana-cellponto',
  'ACC-MARTHI-DEMO',
  'STR-DEMO-01',
  'marianaveigatav@gmail.com',
  'Mariana Veiga',
  'password',
  'f7e8d9c0b1a2:3f64ddcfb96733390a335a7c1eac2e88753947bc637537abb78ad7f7e364aabf',
  'operator',
  true
)
ON CONFLICT (email) DO UPDATE
SET password_hash = EXCLUDED.password_hash,
    name = EXCLUDED.name,
    client_account_id = EXCLUDED.client_account_id,
    active = true,
    global_role = EXCLUDED.global_role;

-- Vínculo da usuária Mariana com a loja Cell Ponto
DO $$ BEGIN
  INSERT INTO user_stores (id, user_id, store_id, role, is_default, permissions)
  SELECT
    'UST-MARIANA-01', u.id, 'STR-DEMO-01', 'operator', true,
    '{"all": true, "pos": true, "os": true, "erp": true, "painel": true}'::jsonb
  FROM users u WHERE u.email = 'marianaveigatav@gmail.com'
  ON CONFLICT (id) DO UPDATE
  SET role = EXCLUDED.role, permissions = EXCLUDED.permissions;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Cadastro da colaboradora na equipe da loja Cell Ponto
INSERT INTO employees (
  id, store_id, name, phone, email, document, role, is_system_user, user_email,
  access_areas, permissions, active
) VALUES (
  'EMP-MARIANA-01',
  'STR-DEMO-01',
  'Mariana Veiga',
  '(24) 98124-4253',
  'marianaveigatav@gmail.com',
  '123.456.789-00',
  'operator',
  true,
  'marianaveigatav@gmail.com',
  '["painel","pdv","os","totem","fiscal","erp"]'::jsonb,
  '{"canEdit": true, "canDelete": true, "posCancelSale": true, "posCancelItem": true}'::jsonb,
  true
)
ON CONFLICT (id) DO UPDATE
SET active = true,
    is_system_user = true,
    user_email = EXCLUDED.user_email,
    access_areas = EXCLUDED.access_areas;
