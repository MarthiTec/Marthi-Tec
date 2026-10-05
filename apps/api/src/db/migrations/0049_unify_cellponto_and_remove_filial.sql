-- Migration 0049: Unificar usuários na loja matriz Cell Ponto e remover loja filial duplicada
DO $$
DECLARE
  v_cellponto_store_id TEXT;
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

  -- 1. Identificar a loja matriz Cell Ponto
  SELECT id, client_account_id INTO v_cellponto_store_id, v_cellponto_account_id
  FROM stores
  WHERE id = 'STR-CELL-PONTO' OR (trade_name ILIKE '%Cell Ponto%' AND trade_name NOT ILIKE '%Filial%' AND trade_name NOT ILIKE '%Shopping%')
  ORDER BY (id = 'STR-CELL-PONTO') DESC, is_matrix DESC
  LIMIT 1;

  IF v_cellponto_store_id IS NULL THEN
    v_cellponto_store_id := 'STR-CELL-PONTO';
  END IF;

  IF v_cellponto_account_id IS NULL THEN
    SELECT id INTO v_cellponto_account_id
    FROM client_accounts
    WHERE trade_name ILIKE '%Cell Ponto%' OR email IN ('marinaveigatav@gmail.com', 'gilvanteodo@gmail.com')
    LIMIT 1;
  END IF;

  -- 2. Garantir usuários Gilvan e Marina vinculados à conta da Cell Ponto
  SELECT id INTO v_gilvan_id FROM users WHERE lower(email) = 'gilvanteodo@gmail.com';
  SELECT id INTO v_marina_id FROM users WHERE lower(email) = 'marinaveigatav@gmail.com';

  -- Garantir que Gilvan está ativo e na conta certa
  IF v_gilvan_id IS NOT NULL THEN
    UPDATE users SET active = true, updated_at = now() WHERE id = v_gilvan_id;
    
    -- Vincula à loja matriz STR-CELL-PONTO
    INSERT INTO user_stores(id, user_id, store_id, role, is_default, created_at)
    VALUES(gen_random_uuid()::text, v_gilvan_id, v_cellponto_store_id, 'admin', true, now())
    ON CONFLICT (user_id, store_id) DO UPDATE SET role = 'admin';

    -- Adiciona ou atualiza em employees da loja matriz
    INSERT INTO employees(id, store_id, name, email, user_email, role, is_system_user, active)
    VALUES(gen_random_uuid()::text, v_cellponto_store_id, 'Gilvan Teodoro', 'gilvanteodo@gmail.com', 'gilvanteodo@gmail.com', 'admin', true, true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Garantir que Marina está ativa e na conta certa
  IF v_marina_id IS NOT NULL THEN
    UPDATE users SET active = true, updated_at = now() WHERE id = v_marina_id;

    -- Vincula à loja matriz STR-CELL-PONTO
    INSERT INTO user_stores(id, user_id, store_id, role, is_default, created_at)
    VALUES(gen_random_uuid()::text, v_marina_id, v_cellponto_store_id, 'admin', false, now())
    ON CONFLICT (user_id, store_id) DO UPDATE SET role = 'admin';

    -- Adiciona ou atualiza em employees da loja matriz
    INSERT INTO employees(id, store_id, name, email, user_email, role, is_system_user, active)
    VALUES(gen_random_uuid()::text, v_cellponto_store_id, 'Marina Veiga', 'marinaveigatav@gmail.com', 'marinaveigatav@gmail.com', 'admin', true, true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- 3. Identificar lojas filiais excedentes a serem removidas (como STR-DEMO-02 ou Cell Ponto Shopping)
  SELECT ARRAY_AGG(id) INTO v_filiais_to_remove
  FROM stores
  WHERE id NOT IN (v_cellponto_store_id, 'STR-DEMO-01')
    AND id <> 'STR-DEMO-01'
    AND (
      trade_name ILIKE '%Filial%'
      OR trade_name ILIKE '%Shopping%'
      OR id = 'STR-DEMO-02'
      OR (trade_name ILIKE '%Cell Ponto%' AND id <> v_cellponto_store_id)
      OR (trade_name ILIKE '%Demonstra%' AND id <> 'STR-DEMO-01')
    );

  IF v_filiais_to_remove IS NOT NULL AND array_length(v_filiais_to_remove, 1) > 0 THEN
    -- Mover referências ou limpar tabelas dependentes
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
