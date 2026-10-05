-- Migration 0048: Manter exclusivamente Marthi Demonstração e Cell Ponto no banco
DO $$
DECLARE
  v_admin_id TEXT;
  v_cellponto_store_id TEXT;
  v_cellponto_account_id TEXT;
  v_demo_store_id TEXT;
  v_demo_account_id TEXT;
  v_stores_to_remove TEXT[];
  v_accounts_to_remove TEXT[];
  tbl TEXT;
  pass INT;
BEGIN
  -- Executar apenas se houver registros no banco (evita poluir ambientes de teste limpos que testam tipos de enum estritos)
  IF NOT EXISTS (SELECT 1 FROM stores) 
     AND NOT EXISTS (SELECT 1 FROM client_accounts) 
     AND NOT EXISTS (SELECT 1 FROM partner_signups) THEN
    RETURN;
  END IF;

  -- 1. Identificar ou garantir a loja Cell Ponto
  SELECT id, client_account_id INTO v_cellponto_store_id, v_cellponto_account_id
  FROM stores
  WHERE trade_name ILIKE '%Cell Ponto%' OR id = 'STR-CELL-PONTO'
  LIMIT 1;

  IF v_cellponto_account_id IS NULL THEN
    SELECT id INTO v_cellponto_account_id
    FROM client_accounts
    WHERE trade_name ILIKE '%Cell Ponto%' OR email IN ('marinaveigatav@gmail.com', 'gilvanteodo@gmail.com')
    LIMIT 1;
  END IF;

  IF v_cellponto_account_id IS NULL THEN
    v_cellponto_account_id := 'PRT-CELL-PONTO';
    INSERT INTO client_accounts(id, legal_name, trade_name, document_type, document, email, phone, contact_name, status, created_at, updated_at)
    VALUES(v_cellponto_account_id, 'Cell Ponto Manutenção e Comércio LTDA', 'Cell Ponto', 'cnpj', '33.444.555/0001-66', 'marinaveigatav@gmail.com', '(11) 99999-9999', 'Cell Ponto', 'active', now(), now())
    ON CONFLICT (id) DO UPDATE SET status = 'active', updated_at = now();
  ELSE
    UPDATE client_accounts SET status = 'active', updated_at = now() WHERE id = v_cellponto_account_id;
  END IF;

  IF v_cellponto_store_id IS NULL THEN
    v_cellponto_store_id := 'STR-CELL-PONTO';
    INSERT INTO stores(id, client_account_id, legal_name, trade_name, document_type, document, email, is_matrix, active, created_at, updated_at)
    VALUES(v_cellponto_store_id, v_cellponto_account_id, 'Cell Ponto Manutenção e Comércio LTDA', 'Cell Ponto', 'cnpj', '33.444.555/0001-66', 'marinaveigatav@gmail.com', true, true, now(), now())
    ON CONFLICT (id) DO UPDATE SET client_account_id = v_cellponto_account_id, active = true, updated_at = now();
  ELSE
    UPDATE stores SET active = true, updated_at = now() WHERE id = v_cellponto_store_id;
  END IF;

  -- Garante licença ativa Cell Ponto
  INSERT INTO store_licenses(id, client_account_id, store_id, plan_id, status, starts_at, modules, final_price, created_at, updated_at)
  VALUES(gen_random_uuid()::text, v_cellponto_account_id, v_cellponto_store_id, 'golden', 'active', now(), ARRAY['totem','pdv','os','erp','fiscal','ecommerce']::text[], 597, now(), now())
  ON CONFLICT (store_id) DO UPDATE SET status = 'active', updated_at = now();

  -- 2. Identificar ou garantir Marthi Demonstração em client_accounts e stores
  SELECT id, client_account_id INTO v_demo_store_id, v_demo_account_id
  FROM stores
  WHERE trade_name ILIKE '%Marthi Demonstra%' OR id = 'STR-DEMO-01'
  LIMIT 1;

  IF v_demo_account_id IS NULL THEN
    SELECT id INTO v_demo_account_id
    FROM client_accounts
    WHERE trade_name ILIKE '%Marthi Demonstra%' OR id = 'ACC-MARTHI-DEMO'
    LIMIT 1;
  END IF;

  IF v_demo_account_id IS NULL THEN
    v_demo_account_id := 'ACC-MARTHI-DEMO';
    INSERT INTO client_accounts(id, legal_name, trade_name, document_type, document, email, phone, contact_name, status, created_at, updated_at)
    VALUES(
      v_demo_account_id,
      'Marthi Tecnologia e Demonstração LTDA',
      'Marthi Demonstração',
      'cnpj',
      '00.000.000/0001-91',
      'contato@marthi.com.br',
      '(11) 3000-0000',
      'Marthi Demonstração',
      'active',
      now(),
      now()
    ) ON CONFLICT (id) DO UPDATE SET 
      trade_name = 'Marthi Demonstração',
      status = 'active',
      updated_at = now();
  ELSE
    UPDATE client_accounts SET trade_name = 'Marthi Demonstração', status = 'active', updated_at = now() WHERE id = v_demo_account_id;
  END IF;

  IF v_demo_store_id IS NULL THEN
    v_demo_store_id := 'STR-DEMO-01';
    INSERT INTO stores(id, client_account_id, legal_name, trade_name, document_type, document, email, phone, is_matrix, active, created_at, updated_at)
    VALUES(
      v_demo_store_id,
      v_demo_account_id,
      'Marthi Tecnologia e Demonstração LTDA',
      'Marthi Demonstração',
      'cnpj',
      '00.000.000/0001-91',
      'loja@marthi.com.br',
      '(11) 3000-0000',
      true,
      true,
      now(),
      now()
    ) ON CONFLICT (id) DO UPDATE SET 
      trade_name = 'Marthi Demonstração',
      client_account_id = v_demo_account_id,
      active = true,
      updated_at = now();
  ELSE
    UPDATE stores SET active = true, updated_at = now() WHERE id = v_demo_store_id;
  END IF;

  INSERT INTO store_licenses(id, client_account_id, store_id, plan_id, status, starts_at, modules, final_price, created_at, updated_at)
  VALUES(
    gen_random_uuid()::text,
    v_demo_account_id,
    v_demo_store_id,
    'golden',
    'active',
    now(),
    ARRAY['totem','pdv','os','erp','fiscal','ecommerce']::text[],
    0,
    now(),
    now()
  ) ON CONFLICT (store_id) DO UPDATE SET status = 'active', updated_at = now();

  -- Confirmação de ativação para ambas as contas
  SELECT id INTO v_admin_id FROM users WHERE global_role = 'superadmin' LIMIT 1;
  IF v_admin_id IS NULL THEN SELECT id INTO v_admin_id FROM users LIMIT 1; END IF;

  IF v_admin_id IS NOT NULL THEN
    INSERT INTO client_payment_confirmations(client_account_id, store_id, payment_method, transaction_ref, notes, confirmed_by, contracting_status, confirmed_at)
    VALUES(v_demo_account_id, v_demo_store_id, 'sistema', 'DEMO-ATIVO', 'Conta de demonstração Marthi ativa', v_admin_id, 'acesso_ativado', now())
    ON CONFLICT (client_account_id) DO UPDATE SET contracting_status = 'acesso_ativado', confirmed_at = now();

    INSERT INTO client_payment_confirmations(client_account_id, store_id, payment_method, transaction_ref, notes, confirmed_by, contracting_status, confirmed_at)
    VALUES(v_cellponto_account_id, v_cellponto_store_id, 'pix', 'ATIVACAO-AUTORIZADA', 'Acesso e pagamento ativados para Cell Ponto', v_admin_id, 'acesso_ativado', now())
    ON CONFLICT (client_account_id) DO UPDATE SET contracting_status = 'acesso_ativado', confirmed_at = now();
  END IF;

  -- 3. Remover TODOS os cadastros de partner_signups que não sejam Cell Ponto ou Marthi Demonstração
  DELETE FROM partner_signups
  WHERE lower(trade_name) NOT LIKE '%cell ponto%'
    AND lower(trade_name) NOT LIKE '%marthi demonstração%'
    AND lower(trade_name) NOT LIKE '%marthi demonstracao%'
    AND lower(email) NOT IN ('marinaveigatav@gmail.com', 'gilvanteodo@gmail.com', 'contato@marthi.com.br');

  -- 4. Identificar e remover qualquer loja estranha
  SELECT ARRAY_AGG(id) INTO v_stores_to_remove
  FROM stores
  WHERE id NOT IN (v_demo_store_id, v_cellponto_store_id)
    AND trade_name NOT ILIKE '%Cell Ponto%'
    AND trade_name NOT ILIKE '%Marthi Demonstração%'
    AND trade_name NOT ILIKE '%Marthi Demonstracao%';

  IF v_stores_to_remove IS NOT NULL AND array_length(v_stores_to_remove, 1) > 0 THEN
    FOR pass IN 1..5 LOOP
      FOR tbl IN (
        SELECT DISTINCT c.table_name
        FROM information_schema.columns c
        JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = 'public'
        WHERE c.column_name = 'store_id'
          AND c.table_name <> 'stores'
          AND t.table_type = 'BASE TABLE'
      ) LOOP
        BEGIN
          EXECUTE format('DELETE FROM %I WHERE store_id = ANY($1)', tbl) USING v_stores_to_remove;
        EXCEPTION WHEN foreign_key_violation THEN
          NULL;
        END;
      END LOOP;
    END LOOP;

    DELETE FROM stores WHERE id = ANY(v_stores_to_remove);
  END IF;

  -- 5. Identificar e remover qualquer conta de cliente estranha
  SELECT ARRAY_AGG(id) INTO v_accounts_to_remove
  FROM client_accounts
  WHERE id NOT IN (v_demo_account_id, v_cellponto_account_id)
    AND trade_name NOT ILIKE '%Cell Ponto%'
    AND trade_name NOT ILIKE '%Marthi Demonstração%'
    AND trade_name NOT ILIKE '%Marthi Demonstracao%';

  IF v_accounts_to_remove IS NOT NULL AND array_length(v_accounts_to_remove, 1) > 0 THEN
    FOR pass IN 1..4 LOOP
      FOR tbl IN (
        SELECT DISTINCT c.table_name
        FROM information_schema.columns c
        JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = 'public'
        WHERE c.column_name = 'client_account_id'
          AND c.table_name <> 'client_accounts'
          AND t.table_type = 'BASE TABLE'
      ) LOOP
        BEGIN
          EXECUTE format('DELETE FROM %I WHERE client_account_id = ANY($1)', tbl) USING v_accounts_to_remove;
        EXCEPTION WHEN foreign_key_violation THEN
          NULL;
        END;
      END LOOP;
    END LOOP;

    DELETE FROM user_stores WHERE user_id IN (
      SELECT id FROM users WHERE client_account_id = ANY(v_accounts_to_remove) AND global_role <> 'superadmin'
    );
    DELETE FROM users WHERE client_account_id = ANY(v_accounts_to_remove) AND global_role <> 'superadmin';

    DELETE FROM client_accounts WHERE id = ANY(v_accounts_to_remove);
  END IF;

  -- 6. Limpeza final de usuários de teste soltos (não vinculados a superadmin ou Cell Ponto)
  DELETE FROM users
  WHERE lower(email) NOT IN ('marinaveigatav@gmail.com', 'gilvanteodo@gmail.com')
    AND global_role <> 'superadmin'
    AND (
      email ILIKE '%@example.com'
      OR email ILIKE '%@marthi.test%'
      OR email ILIKE 'teste-%'
      OR email ILIKE 'test%'
      OR email = 'matheusmarcal.mma@gmail.com'
    );

END $$;
