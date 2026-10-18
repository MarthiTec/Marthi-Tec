-- O banco herdado da versão antiga (Prisma) tem colunas com listas fixas de valores (enum) que
-- não aceitam os valores que o sistema grava hoje (ex.: sales_orders.status só aceitava
-- open/sold/cancelled e a venda grava "completed", gerando "Erro interno do servidor").
-- Converte essas colunas para texto, mantendo os dados e o valor padrão. Só tabelas do sistema
-- (nomes minúsculos); as tabelas do Evolution (CamelCase) ficam como estão.
-- Cada coluna é convertida isoladamente: se uma não puder ser alterada, as demais seguem.
DO $$
DECLARE
  r record;
  def text;
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name, c.column_default
      FROM information_schema.columns c
      JOIN pg_type t ON t.typname = c.udt_name AND t.typtype = 'e'
     WHERE c.table_schema = 'public'
       AND c.table_name = lower(c.table_name)
       AND left(c.table_name, 1) <> '_'
  LOOP
    BEGIN
      IF r.column_default IS NOT NULL THEN
        EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP DEFAULT', r.table_name, r.column_name);
      END IF;
      EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE text USING %I::text', r.table_name, r.column_name, r.column_name);
      IF r.column_default IS NOT NULL THEN
        def := regexp_replace(r.column_default, '::"?[A-Za-z_]+"?$', '');
        EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT %s', r.table_name, r.column_name, def);
      END IF;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Coluna %.% mantida como estava: %', r.table_name, r.column_name, SQLERRM;
    END;
  END LOOP;

  -- Tabelas legadas com arrays de enum (ex.: partner_signups.modules = module_id[])
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = 'partner_signups'
  ) THEN
    ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS plan_id TEXT NOT NULL DEFAULT 'golden';
    ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS modules JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS document_type TEXT NOT NULL DEFAULT 'cnpj';
    ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS document TEXT NOT NULL DEFAULT '';
    ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS legal_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS trade_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
    ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
    ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS zip_code TEXT NOT NULL DEFAULT '';
    ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS street TEXT NOT NULL DEFAULT '';
    ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS number TEXT NOT NULL DEFAULT '';
    ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS complement TEXT DEFAULT '';
    ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS district TEXT NOT NULL DEFAULT '';
    ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS city TEXT NOT NULL DEFAULT '';
    ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT '';
    ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS segment TEXT DEFAULT '';
    ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS contact_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS contact_role TEXT DEFAULT '';
    ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
    ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'aguardando_pagamento';
    ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS monthly_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
    ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'pix';
    ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS transaction_ref TEXT;
    ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ;
    ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS activation_token_sent_at TIMESTAMPTZ;
    ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS audit_trail JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
    ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'partner_signups' AND column_name = 'plan'
    ) THEN
      EXECUTE 'ALTER TABLE partner_signups ALTER COLUMN plan DROP NOT NULL';
      EXECUTE 'UPDATE partner_signups SET plan_id = COALESCE(NULLIF(plan_id, ''''), plan::text, ''golden'') WHERE plan IS NOT NULL';
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'partner_signups'
        AND column_name = 'modules'
        AND data_type <> 'jsonb'
    ) THEN
      ALTER TABLE partner_signups ALTER COLUMN modules DROP DEFAULT;
      ALTER TABLE partner_signups ALTER COLUMN modules TYPE JSONB USING to_jsonb(modules);
      ALTER TABLE partner_signups ALTER COLUMN modules SET DEFAULT '[]'::jsonb;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'store_licenses'
      AND column_name = 'modules'
      AND data_type = 'ARRAY'
      AND udt_name <> '_text'
  ) THEN
    ALTER TABLE store_licenses ALTER COLUMN modules DROP DEFAULT;
    ALTER TABLE store_licenses ALTER COLUMN modules TYPE TEXT[] USING modules::text[];
    ALTER TABLE store_licenses ALTER COLUMN modules SET DEFAULT ARRAY['totem', 'os', 'erp', 'fiscal', 'ecommerce']::TEXT[];
  END IF;
END $$;
