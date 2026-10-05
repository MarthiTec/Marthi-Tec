-- Migration 0051: Reconciliação Definitiva de Dados entre Discloud DB (1789687025416db) e Marthi-Totem
-- 1. Restaura Marthi Demonstração (ACC-MARTHI-DEMO) com sua razão social e documento corretos.
-- 2. Restaura Cell Ponto na sua conta real autêntica (PRT-MUM5YWBG8DSR), com CNPJ 38.297.104/0001-82.
-- 3. Move STR-CELL-PONTO para PRT-MUM5YWBG8DSR com CNPJ 38.297.104/0001-82 e sincroniza store_licenses.
-- 4. Vincula usuários Mariana Marçal, Gilvan Teodoro e Marina Veiga à PRT-MUM5YWBG8DSR e STR-CELL-PONTO.
--    Senhas NÃO são copiadas entre usuários: quem não tem senha define a sua via Primeiro Acesso.
-- 5. Libera temporariamente marthi_guard_account_owner para a reatribuição e restaura a trava estrita ao final.
-- Idempotente: já foi executada manualmente no DB Studio e pode rodar novamente no boot.

CREATE OR REPLACE FUNCTION marthi_guard_account_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.client_account_id IS NOT NULL AND NEW.client_account_id IS DISTINCT FROM OLD.client_account_id THEN
    -- Permite reatribuição legítima quando a loja foi provisoriamente atribuída à conta demo e agora é vinculada à conta real de partner_signups
    IF OLD.client_account_id = 'ACC-MARTHI-DEMO' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Account ownership cannot be reassigned';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_demo_acc text := 'ACC-MARTHI-DEMO';
  v_cellponto_acc text := 'PRT-MUM5YWBG8DSR';
  v_cellponto_store text := 'STR-CELL-PONTO';
  v_demo_store text := 'STR-DEMO-01';
  v_mariana_id text;
  v_gilvan_id text;
  v_marina_id text;
  v_marthi_id text;
BEGIN
  -- 1. Restaurar dados da Conta Marthi Demonstração
  UPDATE client_accounts
  SET legal_name = 'Marthi Tecnologia e Demonstração LTDA',
      trade_name = 'Marthi Demonstração',
      document = '00.000.000/0001-91',
      email = 'contato@marthi.com.br',
      phone = '(11) 3000-0000',
      status = 'active',
      updated_at = now()
  WHERE id = v_demo_acc;

  -- 2. Garantir e atualizar a Conta Real da Cell Ponto
  INSERT INTO client_accounts (
    id, legal_name, trade_name, document_type, document, email, phone, status, created_at, updated_at
  ) VALUES (
    v_cellponto_acc,
    'CELLPONTO CELULARES TRES RIOS LTDA',
    'Cell Ponto',
    'cnpj',
    '38.297.104/0001-82',
    'gilvanteodo@gmail.com',
    '(24) 99966-3631',
    'active',
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    legal_name = 'CELLPONTO CELULARES TRES RIOS LTDA',
    trade_name = 'Cell Ponto',
    document = '38.297.104/0001-82',
    document_type = 'cnpj',
    email = 'gilvanteodo@gmail.com',
    phone = '(24) 99966-3631',
    status = 'active',
    updated_at = now();

  -- 3. Atualizar partner_signups correspondente
  UPDATE partner_signups
  SET status = 'approved',
      converted_store_id = v_cellponto_store,
      updated_at = now()
  WHERE id = v_cellponto_acc;

  -- 4. Atualizar Loja STR-CELL-PONTO com dados oficiais
  UPDATE stores
  SET client_account_id = v_cellponto_acc,
      legal_name = 'CELLPONTO CELULARES TRES RIOS LTDA',
      trade_name = 'Cell Ponto',
      document = '38.297.104/0001-82',
      segment = 'assistencia_tecnica',
      email = 'gilvanteodo@gmail.com',
      phone = '(24) 99966-3631',
      zip_code = '25802-180',
      street = 'Rua Doutor Walmir Peçanha',
      number = '119',
      district = 'Centro',
      city = 'Três Rios',
      state = 'RJ',
      is_matrix = true,
      active = true,
      updated_at = now()
  WHERE id = v_cellponto_store;

  -- 5. Atualizar Loja Demonstração
  UPDATE stores
  SET client_account_id = v_demo_acc,
      legal_name = 'Marthi Demonstração LTDA',
      trade_name = 'Loja Demonstração Marthi',
      document = '00.000.000/0001-91',
      is_matrix = true,
      active = true,
      updated_at = now()
  WHERE id = v_demo_store;

  -- 6. Desativar STR-DEMO-02 para evitar duplicidade de filiais fantasma
  UPDATE stores
  SET active = false,
      updated_at = now()
  WHERE id = 'STR-DEMO-02';

  -- 7. Sincronizar store_licenses
  INSERT INTO store_licenses (
    id, store_id, client_account_id, plan_name, status, expires_at, created_at, updated_at
  ) VALUES (
    'LIC-CELL-PONTO',
    v_cellponto_store,
    v_cellponto_acc,
    'golden',
    'active',
    now() + interval '365 days',
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    client_account_id = v_cellponto_acc,
    store_id = v_cellponto_store,
    status = 'active',
    updated_at = now();

  UPDATE store_licenses
  SET status = 'canceled'
  WHERE store_id = 'STR-DEMO-02';

  -- 9. Sincronizar usuários na conta autêntica Cell Ponto (PRT-MUM5YWBG8DSR)
  -- Usuário Mariana (com 'a')
  UPDATE users
  SET client_account_id = v_cellponto_acc,
      name = 'Mariana Marçal',
      global_role = 'admin',
      active = true,
      updated_at = now()
  WHERE email = 'marianaveigatav@gmail.com'
  RETURNING id INTO v_mariana_id;

  -- Usuário Gilvan
  UPDATE users
  SET client_account_id = v_cellponto_acc,
      name = 'Gilvan Teodoro',
      global_role = 'admin',
      active = true,
      updated_at = now()
  WHERE email = 'gilvanteodo@gmail.com'
  RETURNING id INTO v_gilvan_id;

  -- Usuário Marina (alias sem o 'a')
  UPDATE users
  SET client_account_id = v_cellponto_acc,
      name = 'Marina Veiga',
      global_role = 'admin',
      active = true,
      updated_at = now()
  WHERE email = 'marinaveigatav@gmail.com'
  RETURNING id INTO v_marina_id;

  -- 10. Atualizar user_stores para que todos os operadores tenham acesso à STR-CELL-PONTO
  IF v_mariana_id IS NOT NULL THEN
    INSERT INTO user_stores (id, user_id, store_id, role, is_default, created_at)
    VALUES (gen_random_uuid()::text, v_mariana_id, v_cellponto_store, 'admin', true, now())
    ON CONFLICT (user_id, store_id) DO UPDATE SET role = 'admin', is_default = true;
  END IF;

  IF v_gilvan_id IS NOT NULL THEN
    INSERT INTO user_stores (id, user_id, store_id, role, is_default, created_at)
    VALUES (gen_random_uuid()::text, v_gilvan_id, v_cellponto_store, 'admin', true, now())
    ON CONFLICT (user_id, store_id) DO UPDATE SET role = 'admin', is_default = true;
  END IF;

  IF v_marina_id IS NOT NULL THEN
    INSERT INTO user_stores (id, user_id, store_id, role, is_default, created_at)
    VALUES (gen_random_uuid()::text, v_marina_id, v_cellponto_store, 'admin', true, now())
    ON CONFLICT (user_id, store_id) DO UPDATE SET role = 'admin', is_default = true;
  END IF;

  -- 11. Usuário superadmin Marthi
  SELECT id INTO v_marthi_id FROM users WHERE email = 'marthi.tecnologia@gmail.com';
  IF v_marthi_id IS NOT NULL THEN
    UPDATE users
    SET client_account_id = v_demo_acc,
        global_role = 'superadmin',
        active = true,
        updated_at = now()
    WHERE id = v_marthi_id;

    INSERT INTO user_stores (id, user_id, store_id, role, is_default, created_at)
    VALUES (gen_random_uuid()::text, v_marthi_id, v_demo_store, 'admin', true, now())
    ON CONFLICT (user_id, store_id) DO UPDATE SET role = 'admin', is_default = true;
  END IF;

END $$;

-- Restaura a trava estrita de isolamento entre contas
CREATE OR REPLACE FUNCTION marthi_guard_account_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.client_account_id IS NOT NULL AND NEW.client_account_id IS DISTINCT FROM OLD.client_account_id THEN
    RAISE EXCEPTION 'Account ownership cannot be reassigned' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
