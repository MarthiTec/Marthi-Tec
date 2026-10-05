-- Migration 0049: Unificar usuários na loja matriz Cell Ponto e remover loja filial duplicada
DO $$
DECLARE
  v_cellponto_store_id TEXT := 'STR-CELL-PONTO';
  v_cellponto_account_id TEXT;
  v_gilvan_id TEXT;
  v_marina_id TEXT;
  v_filiais_to_remove TEXT[];
  tbl TEXT;
  pass INT;
BEGIN
  -- Executar apenas se houver registros no banco (evita poluir ambientes de teste limpos)
  IF NOT EXISTS (SELECT 1 FROM stores) THEN
    RETURN;
  END IF;

  -- 1. Obter a conta de cliente proprietária da loja matriz STR-CELL-PONTO
  SELECT client_account_id INTO v_cellponto_account_id
  FROM stores
  WHERE id = v_cellponto_store_id;

  -- Se não achou por ID fixo, busca por trade_name
  IF v_cellponto_account_id IS NULL THEN
    SELECT id, client_account_id INTO v_cellponto_store_id, v_cellponto_account_id
    FROM stores
    WHERE trade_name ILIKE '%Cell Ponto%' AND trade_name NOT ILIKE '%Filial%' AND trade_name NOT ILIKE '%Shopping%'
    ORDER BY is_matrix DESC
    LIMIT 1;
  END IF;

  IF v_cellponto_account_id IS NULL THEN
    RETURN;
  END IF;

  -- 2. Limpar vínculos antigos e recriar Gilvan e Marina sob a mesma conta da loja matriz
  -- (Evita violação da trigger marthi_guard_account_owner e marthi_guard_user_store)
  DELETE FROM user_stores WHERE user_id IN (
    SELECT id FROM users 
    WHERE lower(email) IN ('gilvanteodo@gmail.com', 'marinaveigatav@gmail.com')
      AND client_account_id IS DISTINCT FROM v_cellponto_account_id
  );

  DELETE FROM employees WHERE (
    lower(user_email) IN ('gilvanteodo@gmail.com', 'marinaveigatav@gmail.com')
    OR lower(email) IN ('gilvanteodo@gmail.com', 'marinaveigatav@gmail.com')
  ) AND store_id <> v_cellponto_store_id;

  DELETE FROM users 
  WHERE lower(email) IN ('gilvanteodo@gmail.com', 'marinaveigatav@gmail.com')
    AND client_account_id IS DISTINCT FROM v_cellponto_account_id;

  -- 3. Localizar ou inserir Gilvan Teodoro com o client_account_id correto
  SELECT id INTO v_gilvan_id 
  FROM users 
  WHERE lower(email) = 'gilvanteodo@gmail.com' AND client_account_id = v_cellponto_account_id;

  IF v_gilvan_id IS NULL THEN
    v_gilvan_id := gen_random_uuid()::text;
    INSERT INTO users(id, client_account_id, email, name, provider, global_role, active, created_at, updated_at)
    VALUES(v_gilvan_id, v_cellponto_account_id, 'gilvanteodo@gmail.com', 'Gilvan Teodoro', 'password', 'admin', true, now(), now());
  ELSE
    UPDATE users SET active = true, updated_at = now() WHERE id = v_gilvan_id;
  END IF;

  -- Vincula Gilvan em user_stores na matriz STR-CELL-PONTO
  INSERT INTO user_stores(id, user_id, store_id, role, is_default, created_at)
  VALUES(gen_random_uuid()::text, v_gilvan_id, v_cellponto_store_id, 'admin', true, now())
  ON CONFLICT (user_id, store_id) DO UPDATE SET role = 'admin';

  -- Registra Gilvan em employees
  INSERT INTO employees(id, store_id, name, email, user_email, role, is_system_user, active)
  VALUES(gen_random_uuid()::text, v_cellponto_store_id, 'Gilvan Teodoro', 'gilvanteodo@gmail.com', 'gilvanteodo@gmail.com', 'admin', true, true)
  ON CONFLICT DO NOTHING;

  -- 4. Localizar ou inserir Marina Veiga com o client_account_id correto
  SELECT id INTO v_marina_id 
  FROM users 
  WHERE lower(email) = 'marinaveigatav@gmail.com' AND client_account_id = v_cellponto_account_id;

  IF v_marina_id IS NULL THEN
    v_marina_id := gen_random_uuid()::text;
    INSERT INTO users(id, client_account_id, email, name, provider, global_role, active, created_at, updated_at)
    VALUES(v_marina_id, v_cellponto_account_id, 'marinaveigatav@gmail.com', 'Marina Veiga', 'password', 'admin', true, now(), now());
  ELSE
    UPDATE users SET active = true, updated_at = now() WHERE id = v_marina_id;
  END IF;

  -- Vincula Marina em user_stores na matriz STR-CELL-PONTO
  INSERT INTO user_stores(id, user_id, store_id, role, is_default, created_at)
  VALUES(gen_random_uuid()::text, v_marina_id, v_cellponto_store_id, 'admin', false, now())
  ON CONFLICT (user_id, store_id) DO UPDATE SET role = 'admin';

  -- Registra Marina em employees
  INSERT INTO employees(id, store_id, name, email, user_email, role, is_system_user, active)
  VALUES(gen_random_uuid()::text, v_cellponto_store_id, 'Marina Veiga', 'marinaveigatav@gmail.com', 'marinaveigatav@gmail.com', 'admin', true, true)
  ON CONFLICT DO NOTHING;

  -- 5. Identificar e remover qualquer loja filial excedente (como STR-DEMO-02 ou Cell Ponto Shopping)
  SELECT ARRAY_AGG(id) INTO v_filiais_to_remove
  FROM stores
  WHERE id NOT IN (v_cellponto_store_id, 'STR-DEMO-01')
    AND (
      trade_name ILIKE '%Filial%'
      OR trade_name ILIKE '%Shopping%'
      OR id = 'STR-DEMO-02'
      OR (trade_name ILIKE '%Cell Ponto%' AND id <> v_cellponto_store_id)
      OR (trade_name ILIKE '%Demonstra%' AND id <> 'STR-DEMO-01')
    );

  IF v_filiais_to_remove IS NOT NULL AND array_length(v_filiais_to_remove, 1) > 0 THEN
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
          EXECUTE format('DELETE FROM %I WHERE store_id = ANY($1)', tbl) USING v_filiais_to_remove;
        EXCEPTION WHEN foreign_key_violation THEN
          NULL;
        END;
      END LOOP;
    END LOOP;

    DELETE FROM stores WHERE id = ANY(v_filiais_to_remove);
  END IF;

END $$;
