-- ============================================================================
-- 0009_gilvan_cell_ponto_and_single_store.sql
-- 1. Dados reais da conta contratante Cell Ponto
-- 2. Credenciais e permissões do usuário Gilvan Teodoro (gilvanteodo@gmail.com)
-- 3. Garantir apenas 1 loja habilitada (Cell Ponto Matriz)
-- ============================================================================

-- 1. Conta comercial Cell Ponto
INSERT INTO client_accounts (id, trade_name, legal_name, document_type, document, email, phone, contact_name, status)
VALUES (
  'ACC-MARTHI-DEMO',
  'Cell Ponto',
  'Cell Ponto Telecomunicações LTDA',
  'cnpj',
  '61.506.270/0001-63',
  'gilvanteodo@gmail.com',
  '(24) 98124-4253',
  'Gilvan Teodoro',
  'active'
)
ON CONFLICT (id) DO UPDATE SET
  trade_name = 'Cell Ponto',
  legal_name = 'Cell Ponto Telecomunicações LTDA',
  email = 'gilvanteodo@gmail.com',
  phone = '(24) 98124-4253',
  contact_name = 'Gilvan Teodoro',
  status = 'active';

-- 2. Loja única habilitada (Cell Ponto Matriz)
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
  trade_name = 'Cell Ponto Matriz',
  legal_name = 'Cell Ponto Telecomunicações LTDA',
  phone = '(24) 98124-4253',
  email = 'matriz@cellponto.com.br',
  active = true,
  is_matrix = true,
  updated_at = now();

-- 3. Desativar/remover lojas mockadas secundárias para a conta Cell Ponto (para exibir apenas 1 loja)
DO $$ BEGIN
  ALTER TABLE stores ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

UPDATE stores
SET active = false
WHERE client_account_id = 'ACC-MARTHI-DEMO' AND id != 'STR-DEMO-01';

-- 4. Credenciais do usuário Gilvan Teodoro (senha: 1234)
-- Salt: c1d2e3f4a5b6
-- Hash: sha256(1234 + c1d2e3f4a5b6) = a64dc386ee38db5d8529323c28b52f1e63a8a30364f9faad864ae12e4dfa62cf
INSERT INTO users (id, client_account_id, email, name, provider, password_hash, global_role, active)
VALUES (
  'usr-gilvan-cellponto',
  'ACC-MARTHI-DEMO',
  'gilvanteodo@gmail.com',
  'Gilvan Teodoro',
  'password',
  'c1d2e3f4a5b6:a64dc386ee38db5d8529323c28b52f1e63a8a30364f9faad864ae12e4dfa62cf',
  'admin',
  true
)
ON CONFLICT (email) DO UPDATE
SET password_hash = EXCLUDED.password_hash,
    name = EXCLUDED.name,
    client_account_id = EXCLUDED.client_account_id,
    active = true,
    global_role = 'admin';

-- 5. Vínculo exclusivo do usuário Gilvan com a loja matriz Cell Ponto
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
SET role = 'admin', is_default = true, permissions = EXCLUDED.permissions;

-- Remove qualquer vínculo de Gilvan a outras lojas
DELETE FROM user_stores
WHERE user_id = 'usr-gilvan-cellponto' AND store_id != 'STR-DEMO-01';
