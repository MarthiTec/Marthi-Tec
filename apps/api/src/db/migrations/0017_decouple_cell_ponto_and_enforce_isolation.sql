-- Migration 0017: Decouple Cell Ponto, Clean Demo Tenant Identity, and Enforce Multi-Tenant Isolation
-- 1. Garante que a empresa de demonstração (ACC-MARTHI-DEMO) e sua loja matriz (STR-DEMO-01)
--    utilizem documento, endereço, telefone e tokens próprios da demonstração Marthi,
--    liberando 100% o CNPJ 61.506.270/0001-63 para cadastro posterior como nova empresa.

-- 1.1 Atualiza conta contratante de demonstração para identidade Marthi neutra
UPDATE client_accounts
SET
  trade_name = 'Marthi Demonstração',
  legal_name = 'Marthi Tecnologia e Demonstração LTDA',
  document = '00.000.000/0001-91',
  email = 'contato@marthi.com.br',
  phone = '(11) 3000-0000',
  contact_name = 'Administrador Marthi',
  access_token = 'TK-DEMO-000191-MDEM-01',
  status = 'active',
  updated_at = now()
WHERE id = 'ACC-MARTHI-DEMO';

-- 1.2 Atualiza loja matriz de demonstração
UPDATE stores
SET
  trade_name = 'Loja Demonstração Marthi',
  legal_name = 'Marthi Tecnologia e Demonstração LTDA',
  document = '00.000.000/0001-91',
  email = 'loja@marthi.com.br',
  phone = '(11) 3000-0000',
  zip_code = '01310-100',
  street = 'Avenida Paulista',
  number = '1000',
  complement = 'Sala Demo',
  district = 'Bela Vista',
  city = 'São Paulo',
  state = 'SP',
  access_token = 'TK-DEMO-000191-MDEM-01',
  active = true,
  is_matrix = true,
  updated_at = now()
WHERE id = 'STR-DEMO-01';

-- 1.3 Limpa telefone legado da Cell Ponto nos colaboradores da demonstração
UPDATE employees
SET phone = '(11) 3000-0000', updated_at = now()
WHERE store_id = 'STR-DEMO-01' AND (phone = '(24) 98124-4253' OR phone = '');

-- 2. Limpeza segura de registros legados da Cell Ponto existentes no banco
--    (para permitir que a Cell Ponto seja cadastrada novamente do zero com novo ID e integridade referencial)
DO $$
DECLARE
  v_cell_store_ids TEXT[];
  v_cell_client_ids TEXT[];
BEGIN
  -- Identifica IDs de lojas vinculadas ao CNPJ da antiga Cell Ponto que não sejam STR-DEMO-01
  SELECT ARRAY_AGG(id) INTO v_cell_store_ids
  FROM stores
  WHERE (document LIKE '61.506.270%' OR trade_name ILIKE '%Cell Ponto%')
    AND id != 'STR-DEMO-01';

  IF v_cell_store_ids IS NOT NULL AND ARRAY_LENGTH(v_cell_store_ids, 1) > 0 THEN
    -- Exclui tabelas filhas com integridade referencial
    DELETE FROM stock_movements WHERE store_id = ANY(v_cell_store_ids);
    DELETE FROM stock_items WHERE store_id = ANY(v_cell_store_ids);
    DELETE FROM product_attributes WHERE store_id = ANY(v_cell_store_ids);
    DELETE FROM products WHERE store_id = ANY(v_cell_store_ids);
    DELETE FROM customers WHERE store_id = ANY(v_cell_store_ids);
    DELETE FROM suppliers WHERE store_id = ANY(v_cell_store_ids);
    DELETE FROM sellers WHERE store_id = ANY(v_cell_store_ids);
    DELETE FROM payables WHERE store_id = ANY(v_cell_store_ids);
    DELETE FROM receivables WHERE store_id = ANY(v_cell_store_ids);
    DELETE FROM user_stores WHERE store_id = ANY(v_cell_store_ids);
    DELETE FROM employees WHERE store_id = ANY(v_cell_store_ids);
    DELETE FROM store_licenses WHERE store_id = ANY(v_cell_store_ids);
    DELETE FROM stores WHERE id = ANY(v_cell_store_ids);
  END IF;

  -- Identifica contas de clientes vinculadas ao CNPJ da Cell Ponto que não sejam ACC-MARTHI-DEMO
  SELECT ARRAY_AGG(id) INTO v_cell_client_ids
  FROM client_accounts
  WHERE (document LIKE '61.506.270%' OR trade_name ILIKE '%Cell Ponto%')
    AND id != 'ACC-MARTHI-DEMO';

  IF v_cell_client_ids IS NOT NULL AND ARRAY_LENGTH(v_cell_client_ids, 1) > 0 THEN
    DELETE FROM store_licenses WHERE client_account_id = ANY(v_cell_client_ids);
    DELETE FROM stores WHERE client_account_id = ANY(v_cell_client_ids);
    DELETE FROM users WHERE client_account_id = ANY(v_cell_client_ids);
    DELETE FROM client_accounts WHERE id = ANY(v_cell_client_ids);
  END IF;

  -- Remove usuários e logins legados da antiga Cell Ponto
  DELETE FROM user_stores WHERE user_id IN (
    SELECT id FROM users WHERE email IN ('gilvanteodo@gmail.com', 'gilvancellponto@gmail.com', 'marianaveigatav@gmail.com')
  );
  DELETE FROM employees WHERE user_email IN ('gilvanteodo@gmail.com', 'gilvancellponto@gmail.com', 'marianaveigatav@gmail.com');
  DELETE FROM users WHERE email IN ('gilvanteodo@gmail.com', 'gilvancellponto@gmail.com', 'marianaveigatav@gmail.com');

  -- Remove propostas e signups vinculados à antiga Cell Ponto para liberação total do CNPJ
  DELETE FROM partner_signups
  WHERE document LIKE '61.506.270%'
     OR email IN ('gilvanteodo@gmail.com', 'gilvancellponto@gmail.com', 'marianaveigatav@gmail.com');

END $$;
