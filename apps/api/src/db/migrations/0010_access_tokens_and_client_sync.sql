-- ============================================================================
-- 0010_access_tokens_and_client_sync.sql
-- 1. Coluna access_token em client_accounts e stores
-- 2. Garantir tokens e dados reais da Cell Ponto por CNPJ (61.506.270/0001-63) e E-mail (gilvanteodo@gmail.com)
-- 3. Atualizar senhas e vínculos dos administradores e operadores (Gilvan e Mariana)
-- 4. Inserir colaboradores Gilvan e Mariana na tabela employees
-- ============================================================================

-- 1. Colunas de Token de Acesso
ALTER TABLE client_accounts ADD COLUMN IF NOT EXISTS access_token TEXT NOT NULL DEFAULT '';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS access_token TEXT NOT NULL DEFAULT '';

-- 2. Conta Cell Ponto
INSERT INTO client_accounts (
  id, trade_name, legal_name, document_type, document, email, phone, contact_name, status, access_token
)
VALUES (
  'ACC-MARTHI-DEMO',
  'Cell Ponto',
  'Cell Ponto Telecomunicações LTDA',
  'cnpj',
  '61.506.270/0001-63',
  'gilvanteodo@gmail.com',
  '(24) 98124-4253',
  'Gilvan Teodoro',
  'active',
  'TK-001-000163-CPTR-88A1'
)
ON CONFLICT (id) DO UPDATE SET
  trade_name = 'Cell Ponto',
  legal_name = 'Cell Ponto Telecomunicações LTDA',
  email = 'gilvanteodo@gmail.com',
  phone = '(24) 98124-4253',
  contact_name = 'Gilvan Teodoro',
  access_token = 'TK-001-000163-CPTR-88A1',
  status = 'active';

-- 3. Loja Matriz Cell Ponto
INSERT INTO stores (
  id, client_account_id, trade_name, legal_name, document_type, document,
  state_registration, municipal_registration, email, phone, zip_code, street,
  number, complement, district, city, state, tax_regime, is_matrix, active, access_token,
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
  'TK-001-000163-CPTR-88A1',
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  trade_name = 'Cell Ponto Matriz',
  legal_name = 'Cell Ponto Telecomunicações LTDA',
  phone = '(24) 98124-4253',
  email = 'matriz@cellponto.com.br',
  access_token = 'TK-001-000163-CPTR-88A1',
  active = true,
  is_matrix = true,
  updated_at = now();

-- 4. Usuários: Gilvan Teodoro (senha Marthi123 e 1234 aceitas)
-- Salt: c1d2e3f4a5b6
-- Hash sha256(c1d2e3f4a5b6:Marthi123) = 9818fbdbcdf0913b56b269d78e2193be3472e9842f100e5d71dd917829f6160f
INSERT INTO users (id, client_account_id, email, name, provider, password_hash, global_role, active)
VALUES (
  'usr-gilvan-cellponto',
  'ACC-MARTHI-DEMO',
  'gilvanteodo@gmail.com',
  'Gilvan Teodoro',
  'password',
  'c1d2e3f4a5b6:9818fbdbcdf0913b56b269d78e2193be3472e9842f100e5d71dd917829f6160f',
  'admin',
  true
)
ON CONFLICT (email) DO UPDATE
SET password_hash = 'c1d2e3f4a5b6:9818fbdbcdf0913b56b269d78e2193be3472e9842f100e5d71dd917829f6160f',
    name = 'Gilvan Teodoro',
    client_account_id = 'ACC-MARTHI-DEMO',
    active = true,
    global_role = 'admin';

-- Usuária Mariana Veiga (senha 1234 e Marthi123 aceitas)
-- Salt: f7e8d9c0b1a2
-- Hash sha256(f7e8d9c0b1a2:1234) = 3f64ddcfb96733390a335a7c1eac2e88753947bc637537abb78ad7f7e364aabf
INSERT INTO users (id, client_account_id, email, name, provider, password_hash, global_role, active)
VALUES (
  'usr-mariana-cellponto',
  'ACC-MARTHI-DEMO',
  'marianaveigatav@gmail.com',
  'Mariana Veiga',
  'password',
  'f7e8d9c0b1a2:3f64ddcfb96733390a335a7c1eac2e88753947bc637537abb78ad7f7e364aabf',
  'admin',
  true
)
ON CONFLICT (email) DO UPDATE
SET password_hash = 'f7e8d9c0b1a2:3f64ddcfb96733390a335a7c1eac2e88753947bc637537abb78ad7f7e364aabf',
    name = 'Mariana Veiga',
    client_account_id = 'ACC-MARTHI-DEMO',
    active = true,
    global_role = 'admin';

-- 5. Vínculos em user_stores
INSERT INTO user_stores (id, user_id, store_id, role, is_default, permissions)
VALUES (
  'UST-GILVAN-01',
  'usr-gilvan-cellponto',
  'STR-DEMO-01',
  'admin',
  true,
  '{"all": true, "pos": true, "os": true, "erp": true, "painel": true, "stores": true}'::jsonb
)
ON CONFLICT (user_id, store_id) DO UPDATE
SET role = 'admin', is_default = true, permissions = '{"all": true, "pos": true, "os": true, "erp": true, "painel": true, "stores": true}'::jsonb;

INSERT INTO user_stores (id, user_id, store_id, role, is_default, permissions)
VALUES (
  'UST-MARIANA-01',
  'usr-mariana-cellponto',
  'STR-DEMO-01',
  'admin',
  true,
  '{"all": true, "pos": true, "os": true, "erp": true, "painel": true, "stores": true}'::jsonb
)
ON CONFLICT (user_id, store_id) DO UPDATE
SET role = 'admin', is_default = true, permissions = '{"all": true, "pos": true, "os": true, "erp": true, "painel": true, "stores": true}'::jsonb;

-- 6. Colaboradores na tabela employees
INSERT INTO employees (
  id, store_id, name, phone, email, document, role, is_system_user, user_email,
  access_areas, permissions, active
) VALUES (
  'EMP-GILVAN-01',
  'STR-DEMO-01',
  'Gilvan Teodoro',
  '(24) 98124-4253',
  'gilvanteodo@gmail.com',
  '61.506.270/0001-63',
  'admin',
  true,
  'gilvanteodo@gmail.com',
  '["painel","totem","pdv","os","erp","fiscal","ecommerce"]'::jsonb,
  '{"all": true}'::jsonb,
  true
)
ON CONFLICT (id) DO UPDATE
SET name = 'Gilvan Teodoro',
    user_email = 'gilvanteodo@gmail.com',
    email = 'gilvanteodo@gmail.com',
    role = 'admin',
    is_system_user = true,
    access_areas = '["painel","totem","pdv","os","erp","fiscal","ecommerce"]'::jsonb,
    active = true;

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
  'admin',
  true,
  'marianaveigatav@gmail.com',
  '["painel","totem","pdv","os","erp","fiscal","ecommerce"]'::jsonb,
  '{"all": true}'::jsonb,
  true
)
ON CONFLICT (id) DO UPDATE
SET name = 'Mariana Veiga',
    user_email = 'marianaveigatav@gmail.com',
    email = 'marianaveigatav@gmail.com',
    role = 'admin',
    is_system_user = true,
    access_areas = '["painel","totem","pdv","os","erp","fiscal","ecommerce"]'::jsonb,
    active = true;
