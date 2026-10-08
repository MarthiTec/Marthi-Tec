-- O banco herdado da versão antiga tem colunas obrigatórias que o sistema atual não preenche
-- (ex.: sales_orders.product_name), e cada uma travava uma gravação com "Erro interno do servidor".
-- Lista gerada comparando o banco de produção com o esquema atual: quando o esquema atual tem
-- valor padrão, a coluna recebe o mesmo padrão; quando é campo antigo, passa a ser opcional.
-- Chaves primárias não são alteradas; tabelas antigas que o sistema não usa ficam como estão.
-- Cada coluna é tratada isoladamente: se uma falhar, as demais seguem.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('bank_accounts', 'type', '''checking''::text'),
    ('cash_movements', 'kind', NULL),
    ('cash_movements', 'operator_name', NULL),
    ('cash_session_events', 'store_id', NULL),
    ('cash_session_events', 'type', NULL),
    ('cash_sessions', 'expected_cash', '0'),
    ('cash_sessions', 'opened_at', 'now()'),
    ('cash_sessions', 'opening_float', '0'),
    ('cash_sessions', 'operator_name', '''''::text'),
    ('partner_signups', 'city', '''''::text'),
    ('partner_signups', 'district', '''''::text'),
    ('partner_signups', 'document_type', '''cnpj''::text'),
    ('partner_signups', 'number', '''''::text'),
    ('partner_signups', 'state', '''''::bpchar'),
    ('partner_signups', 'street', '''''::text'),
    ('partner_signups', 'zip_code', '''''::text'),
    ('payables', 'category', '''Geral''::text'),
    ('payables', 'supplier_name', '''''::text'),
    ('payment_methods', 'max_installments', '1'),
    ('pos_quote_lines', 'qty', '1'),
    ('pos_quotes', 'customer_name', '''''::text'),
    ('pos_quotes', 'quote_number', NULL),
    ('pos_quotes', 'valid_until', NULL),
    ('pos_ticket_attributes', 'attribute_id', NULL),
    ('product_kit_items', 'qty', '1'),
    ('product_kit_items', 'stock_id', NULL),
    ('product_kit_items', 'stock_name', NULL),
    ('product_lots', 'qty', '0'),
    ('product_lots', 'stock_id', NULL),
    ('product_lots', 'stock_name', NULL),
    ('product_lots', 'warehouse_id', NULL),
    ('promo_campaign_tiers', 'qty', NULL),
    ('promo_campaign_tiers', 'total_price', NULL),
    ('receivables', 'category', '''Vendas''::text'),
    ('receivables', 'customer_name', '''''::text'),
    ('sale_payments', 'method_name', '''''::text'),
    ('sales_order_lines', 'order_id', NULL),
    ('sales_order_lines', 'qty', '1'),
    ('sales_order_lines', 'unit_price', '0'),
    ('sales_orders', 'amount', '0'),
    ('sales_orders', 'customer_name', '''''::text'),
    ('sales_orders', 'payment', '''''::text'),
    ('sales_orders', 'product_name', '''''::text'),
    ('sales_orders', 'status', '''completed''::text'),
    ('stock_inventories', 'code', NULL),
    ('stock_inventories', 'responsible_user', NULL),
    ('stock_inventories', 'title', NULL),
    ('stock_inventory_items', 'name', NULL),
    ('stock_inventory_items', 'stock_id', NULL),
    ('stock_invoice_lines', 'qty', '1'),
    ('stock_invoice_lines', 'unit_cost', '0'),
    ('stock_invoice_lines', 'unit_price', '0'),
    ('stock_invoices', 'kind', '''entry''::text'),
    ('stock_invoices', 'number', '''''::text'),
    ('stock_items', 'kind', '''device''::text'),
    ('stock_movements', 'stock_id', NULL),
    ('stores', 'document_type', '''cnpj''::text'),
    ('treasury_moves', 'description', '''''::text'),
    ('treasury_moves', 'kind', '''transfer''::text'),
    ('work_orders', 'customer_name', '''''::text'),
    ('work_orders', 'defect', '''''::text'),
    ('work_orders', 'item_name', '''''::text')
  ) AS t(table_name, column_name, default_expr)
  LOOP
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns c
         WHERE c.table_schema = 'public' AND c.table_name = r.table_name AND c.column_name = r.column_name
           AND c.is_nullable = 'NO' AND c.column_default IS NULL
      ) THEN
        CONTINUE;
      END IF;
      IF EXISTS (
        SELECT 1 FROM pg_index i
          JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
         WHERE i.indrelid = format('public.%I', r.table_name)::regclass AND i.indisprimary AND a.attname = r.column_name
      ) THEN
        CONTINUE;
      END IF;
      IF r.default_expr IS NOT NULL THEN
        EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT %s', r.table_name, r.column_name, r.default_expr);
      ELSE
        EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP NOT NULL', r.table_name, r.column_name);
      END IF;
    EXCEPTION WHEN others THEN
      BEGIN
        EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP NOT NULL', r.table_name, r.column_name);
      EXCEPTION WHEN others THEN
        RAISE NOTICE 'Coluna %.% mantida como estava: %', r.table_name, r.column_name, SQLERRM;
      END;
    END;
  END LOOP;
END $$;
