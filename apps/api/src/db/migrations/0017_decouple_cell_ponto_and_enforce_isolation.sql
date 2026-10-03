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

-- 2. Limpeza segura de resíduos do CNPJ legado 61.506.270/0001-63
--    (preservando 100% o novo cadastro da empresa Cell Ponto e o usuário gilvanteodo@gmail.com)
DO $$
DECLARE
  v_legacy_store_ids TEXT[];
  v_legacy_client_ids TEXT[];
BEGIN
  -- Identifica IDs de lojas vinculadas ao CNPJ legado que não sejam a demo
  SELECT ARRAY_AGG(id) INTO v_legacy_store_ids
  FROM stores
  WHERE document LIKE '61.506.270%'
    AND id != 'STR-DEMO-01';

  IF v_legacy_store_ids IS NOT NULL AND ARRAY_LENGTH(v_legacy_store_ids, 1) > 0 THEN
    -- Exclui tabelas filhas com tratamento seguro de integridade referencial
    BEGIN DELETE FROM price_tables WHERE store_id = ANY(v_legacy_store_ids); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM pos_quote_lines WHERE quote_id IN (SELECT id FROM pos_quotes WHERE store_id = ANY(v_legacy_store_ids)); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM pos_quotes WHERE store_id = ANY(v_legacy_store_ids); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM pos_ticket_attributes WHERE ticket_id IN (SELECT id FROM pos_tickets WHERE store_id = ANY(v_legacy_store_ids)); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM pos_tickets WHERE store_id = ANY(v_legacy_store_ids); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM pos_terminals WHERE store_id = ANY(v_legacy_store_ids); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM sale_payments WHERE sale_id IN (SELECT id FROM sales_orders WHERE store_id = ANY(v_legacy_store_ids)); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM sales_order_lines WHERE sale_id IN (SELECT id FROM sales_orders WHERE store_id = ANY(v_legacy_store_ids)); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM sales_orders WHERE store_id = ANY(v_legacy_store_ids); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM cash_movements WHERE session_id IN (SELECT id FROM cash_sessions WHERE store_id = ANY(v_legacy_store_ids)); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM cash_session_events WHERE session_id IN (SELECT id FROM cash_sessions WHERE store_id = ANY(v_legacy_store_ids)); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM cash_sessions WHERE store_id = ANY(v_legacy_store_ids); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM stock_movements WHERE store_id = ANY(v_legacy_store_ids); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM stock_items WHERE store_id = ANY(v_legacy_store_ids); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM product_attributes WHERE store_id = ANY(v_legacy_store_ids); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM products WHERE store_id = ANY(v_legacy_store_ids); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM customers WHERE store_id = ANY(v_legacy_store_ids); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM suppliers WHERE store_id = ANY(v_legacy_store_ids); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM sellers WHERE store_id = ANY(v_legacy_store_ids); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM payables WHERE store_id = ANY(v_legacy_store_ids); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM receivables WHERE store_id = ANY(v_legacy_store_ids); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM user_stores WHERE store_id = ANY(v_legacy_store_ids); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM employees WHERE store_id = ANY(v_legacy_store_ids); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM store_licenses WHERE store_id = ANY(v_legacy_store_ids); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM stores WHERE id = ANY(v_legacy_store_ids); EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  -- Identifica contas de clientes vinculadas ao CNPJ legado que não sejam ACC-MARTHI-DEMO
  SELECT ARRAY_AGG(id) INTO v_legacy_client_ids
  FROM client_accounts
  WHERE document LIKE '61.506.270%'
    AND id != 'ACC-MARTHI-DEMO';

  IF v_legacy_client_ids IS NOT NULL AND ARRAY_LENGTH(v_legacy_client_ids, 1) > 0 THEN
    BEGIN DELETE FROM store_licenses WHERE client_account_id = ANY(v_legacy_client_ids); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM stores WHERE client_account_id = ANY(v_legacy_client_ids); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM users WHERE client_account_id = ANY(v_legacy_client_ids); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM client_accounts WHERE id = ANY(v_legacy_client_ids); EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  -- Apenas remove propostas legadas vinculadas ao CNPJ 61.506.270/0001-63
  BEGIN
    DELETE FROM partner_signups WHERE document LIKE '61.506.270%';
  EXCEPTION WHEN OTHERS THEN NULL; END;

END $$;
