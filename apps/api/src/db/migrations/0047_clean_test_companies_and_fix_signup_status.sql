-- Migration 0047: Corrige enum signup_status, remove empresas e usuários de teste, e ativa loja Cell Ponto
DO $$
BEGIN
  -- 1. Se o enum signup_status existir, adiciona valores pendentes
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'signup_status') THEN
    BEGIN
      ALTER TYPE signup_status ADD VALUE IF NOT EXISTS 'acesso_ativado';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER TYPE signup_status ADD VALUE IF NOT EXISTS 'acesso_pendente';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER TYPE signup_status ADD VALUE IF NOT EXISTS 'cliente_criado';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER TYPE signup_status ADD VALUE IF NOT EXISTS 'pagamento_aprovado';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;

  -- 2. Altera a coluna status de partner_signups para TEXT para flexibilidade total
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'partner_signups' AND column_name = 'status'
  ) THEN
    ALTER TABLE partner_signups ALTER COLUMN status TYPE TEXT;
  END IF;
END $$;

-- 3. Limpeza dinâmica e segura de lojas e cadastros de teste gerados por scripts e2e
DO $$
DECLARE
  v_test_stores TEXT[];
  tbl TEXT;
  pass INT;
BEGIN
  SELECT ARRAY_AGG(id) INTO v_test_stores
  FROM stores 
  WHERE trade_name ILIKE '%AutoPeças Alpha%' 
     OR trade_name ILIKE '%Padaria Beta%' 
     OR id LIKE 'STR-PRT-%';

  IF v_test_stores IS NOT NULL AND array_length(v_test_stores, 1) > 0 THEN
    -- Múltiplas passagens sobre qualquer tabela que contenha store_id no banco para resolver dependências de FK
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
          EXECUTE format('DELETE FROM %I WHERE store_id = ANY($1)', tbl) USING v_test_stores;
        EXCEPTION WHEN foreign_key_violation THEN
          NULL;
        END;
      END LOOP;
    END LOOP;

    -- Deleta as lojas de teste
    DELETE FROM stores WHERE id = ANY(v_test_stores);
  END IF;

  -- Limpeza das contas de teste e dependências
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
        EXECUTE format('DELETE FROM %I WHERE client_account_id IN (
          SELECT id FROM client_accounts 
          WHERE trade_name ILIKE ''%%AutoPeças Alpha%%'' 
             OR trade_name ILIKE ''%%Padaria Beta%%'' 
             OR email ILIKE ''%%@marthi.teste''
             OR id LIKE ''PRT-MURB%%''
             OR id LIKE ''PRT-MURC%%''
        )', tbl);
      EXCEPTION WHEN foreign_key_violation THEN
        NULL;
      END;
    END LOOP;
  END LOOP;

  IF to_regclass('client_accounts') IS NOT NULL THEN
    DELETE FROM client_accounts 
    WHERE trade_name ILIKE '%AutoPeças Alpha%' 
       OR trade_name ILIKE '%Padaria Beta%' 
       OR email ILIKE '%@marthi.teste'
       OR id LIKE 'PRT-MURB%'
       OR id LIKE 'PRT-MURC%';
  END IF;

  IF to_regclass('partner_signups') IS NOT NULL THEN
    DELETE FROM partner_signups 
    WHERE email ILIKE '%@marthi.teste' 
       OR trade_name ILIKE '%AutoPeças Alpha%' 
       OR trade_name ILIKE '%Padaria Beta%';
  END IF;

  IF to_regclass('auth_tokens') IS NOT NULL THEN
    DELETE FROM auth_tokens WHERE email ILIKE '%@marthi.teste';
  END IF;

  IF to_regclass('user_stores') IS NOT NULL THEN
    DELETE FROM user_stores WHERE user_id IN (
      SELECT id FROM users WHERE email ILIKE '%@marthi.teste'
    );
  END IF;

  IF to_regclass('users') IS NOT NULL THEN
    DELETE FROM users WHERE email ILIKE '%@marthi.teste';
  END IF;
END $$;

-- 4. Assegurar ativação da loja real Cell Ponto e seus usuários autênticos
DO $$
DECLARE
  v_store_id TEXT;
  v_account_id TEXT;
  v_gilvan_id TEXT;
  v_marina_id TEXT;
  v_admin_id TEXT;
BEGIN
  -- Localiza a loja Cell Ponto
  SELECT id, client_account_id INTO v_store_id, v_account_id 
  FROM stores 
  WHERE trade_name ILIKE '%Cell Ponto%' OR id = 'STR-CELL-PONTO'
  LIMIT 1;

  IF v_store_id IS NOT NULL THEN
    -- Ativa a loja Cell Ponto
    UPDATE stores SET active = true, updated_at = now() WHERE id = v_store_id;

    -- Se tiver conta de cliente vinculada, ativa e confirma licença
    IF v_account_id IS NOT NULL THEN
      UPDATE client_accounts SET status = 'active', updated_at = now() WHERE id = v_account_id;
      
      IF NOT EXISTS (SELECT 1 FROM store_licenses WHERE store_id = v_store_id) THEN
        INSERT INTO store_licenses(id, client_account_id, store_id, plan_id, status, starts_at, modules, final_price, created_at, updated_at)
        VALUES(gen_random_uuid()::text, v_account_id, v_store_id, 'golden', 'active', now(), ARRAY['totem','pdv','os','erp','fiscal','ecommerce']::text[], 597, now(), now());
      ELSE
        UPDATE store_licenses SET status = 'active', updated_at = now() WHERE store_id = v_store_id;
      END IF;

      SELECT id INTO v_admin_id FROM users WHERE global_role = 'superadmin' LIMIT 1;
      IF v_admin_id IS NULL THEN
        SELECT id INTO v_admin_id FROM users LIMIT 1;
      END IF;

      IF v_admin_id IS NOT NULL THEN
        INSERT INTO client_payment_confirmations(client_account_id, store_id, payment_method, transaction_ref, notes, confirmed_by, contracting_status, confirmed_at)
        VALUES(v_account_id, v_store_id, 'pix', 'ATIVACAO-AUTORIZADA', 'Acesso e pagamento ativados para Cell Ponto', v_admin_id, 'acesso_ativado', now())
        ON CONFLICT (client_account_id) DO UPDATE SET contracting_status = 'acesso_ativado', confirmed_at = now();
      END IF;
    END IF;

    -- Localiza ou cria gilvanteodo@gmail.com
    SELECT id INTO v_gilvan_id FROM users WHERE lower(email) = 'gilvanteodo@gmail.com';
    IF v_gilvan_id IS NULL THEN
      v_gilvan_id := gen_random_uuid()::text;
      INSERT INTO users(id, client_account_id, email, name, provider, global_role, active, created_at, updated_at)
      VALUES(v_gilvan_id, v_account_id, 'gilvanteodo@gmail.com', 'Gilvan Teodoro', 'password', 'admin', true, now(), now());
    ELSE
      UPDATE users SET active = true, client_account_id = COALESCE(v_account_id, client_account_id), updated_at = now() WHERE id = v_gilvan_id;
    END IF;

    -- Vincula Gilvan em user_stores
    INSERT INTO user_stores(id, user_id, store_id, role, is_default, created_at)
    VALUES(gen_random_uuid()::text, v_gilvan_id, v_store_id, 'admin', true, now())
    ON CONFLICT (user_id, store_id) DO UPDATE SET role = 'admin';

    -- Vincula Gilvan em employees
    INSERT INTO employees(id, store_id, name, email, user_email, role, is_system_user, active)
    VALUES(gen_random_uuid()::text, v_store_id, 'Gilvan Teodoro', 'gilvanteodo@gmail.com', 'gilvanteodo@gmail.com', 'admin', true, true)
    ON CONFLICT DO NOTHING;

    -- Localiza ou cria marinaveigatav@gmail.com
    SELECT id INTO v_marina_id FROM users WHERE lower(email) = 'marinaveigatav@gmail.com';
    IF v_marina_id IS NULL THEN
      v_marina_id := gen_random_uuid()::text;
      INSERT INTO users(id, client_account_id, email, name, provider, global_role, active, created_at, updated_at)
      VALUES(v_marina_id, v_account_id, 'marinaveigatav@gmail.com', 'Marina Veiga', 'password', 'admin', true, now(), now());
    ELSE
      UPDATE users SET active = true, client_account_id = COALESCE(v_account_id, client_account_id), updated_at = now() WHERE id = v_marina_id;
    END IF;

    -- Vincula Marina em user_stores
    INSERT INTO user_stores(id, user_id, store_id, role, is_default, created_at)
    VALUES(gen_random_uuid()::text, v_marina_id, v_store_id, 'admin', false, now())
    ON CONFLICT (user_id, store_id) DO UPDATE SET role = 'admin';

    -- Vincula Marina em employees
    INSERT INTO employees(id, store_id, name, email, user_email, role, is_system_user, active)
    VALUES(gen_random_uuid()::text, v_store_id, 'Marina Veiga', 'marinaveigatav@gmail.com', 'marinaveigatav@gmail.com', 'admin', true, true)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
