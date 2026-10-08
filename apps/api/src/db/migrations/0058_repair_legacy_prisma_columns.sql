-- O MarthiDB de produção nasceu de uma versão anterior do sistema (Prisma). Como as migrations
-- usam CREATE TABLE IF NOT EXISTS, várias tabelas antigas nunca receberam as colunas atuais e
-- outras têm colunas obrigatórias sem valor padrão. Resultado: cadastro de cliente, venda externa,
-- PDV, OS, vendedores, fornecedores e notas falhavam com "Erro interno do servidor".
-- Esta migration só acrescenta colunas e valores padrão; nenhum dado existente é apagado.

-- 1) created_at / updated_at obrigatórios sem padrão (o Prisma preenchia pela aplicação).
--    Só colunas snake_case: as tabelas do Evolution (updatedAt) ficam intocadas.
DO $$
DECLARE
  col RECORD;
BEGIN
  FOR col IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND column_name IN ('created_at', 'updated_at')
      AND column_default IS NULL
      AND data_type LIKE 'timestamp%'
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT now()', col.table_name, col.column_name);
  END LOOP;
END $$;

-- 2) Clientes: colunas do cadastro atual.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS trade_name TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS document_type TEXT NOT NULL DEFAULT 'cpf';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS district TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_group TEXT NOT NULL DEFAULT 'Padrão';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
DO $$
BEGIN
  -- O cadastro antigo chamava o bairro de "neighborhood".
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'customers' AND column_name = 'neighborhood') THEN
    UPDATE customers SET district = neighborhood WHERE district = '' AND coalesce(neighborhood, '') <> '';
  END IF;
END $$;

-- 3) Vendas: "amount" e "payment" antigos são obrigatórios e o código atual grava em
--    final_amount / payment_name. Um gatilho mantém as colunas antigas preenchidas.
CREATE OR REPLACE FUNCTION marthi_sales_orders_legacy_fill() RETURNS trigger AS $$
BEGIN
  NEW.amount := COALESCE(NULLIF(NEW.amount, 0), NEW.final_amount, NEW.total, 0);
  NEW.payment := COALESCE(NULLIF(NEW.payment, ''), NEW.payment_name, '');
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'sales_orders' AND column_name = 'amount')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'sales_orders' AND column_name = 'payment') THEN
    DROP TRIGGER IF EXISTS marthi_sales_orders_legacy_fill ON sales_orders;
    CREATE TRIGGER marthi_sales_orders_legacy_fill BEFORE INSERT ON sales_orders
      FOR EACH ROW EXECUTE FUNCTION marthi_sales_orders_legacy_fill();
  END IF;
END $$;

-- 4) Linhas de nota de entrada: "stock_id" antigo é obrigatório; o código grava stock_item_id.
ALTER TABLE stock_invoice_lines ADD COLUMN IF NOT EXISTS total_cost NUMERIC(12,2) NOT NULL DEFAULT 0;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'stock_invoice_lines' AND column_name = 'stock_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'stock_invoice_lines' AND column_name = 'stock_item_id') THEN
    ALTER TABLE stock_invoice_lines ALTER COLUMN stock_id DROP NOT NULL;
    CREATE OR REPLACE FUNCTION marthi_stock_invoice_lines_legacy_fill() RETURNS trigger AS $fn$
    BEGIN
      NEW.stock_id := COALESCE(NEW.stock_id, NEW.stock_item_id);
      RETURN NEW;
    END $fn$ LANGUAGE plpgsql;
    DROP TRIGGER IF EXISTS marthi_stock_invoice_lines_legacy_fill ON stock_invoice_lines;
    CREATE TRIGGER marthi_stock_invoice_lines_legacy_fill BEFORE INSERT ON stock_invoice_lines
      FOR EACH ROW EXECUTE FUNCTION marthi_stock_invoice_lines_legacy_fill();
  END IF;
END $$;

-- 5) Ordens de serviço: colunas usadas na abertura e no fechamento da OS.
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS device_brand TEXT NOT NULL DEFAULT '';
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS device_model TEXT NOT NULL DEFAULT '';
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS serial_or_imei TEXT NOT NULL DEFAULT '';
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS defect_description TEXT NOT NULL DEFAULT '';
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS technical_report TEXT NOT NULL DEFAULT '';
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS labor_cost NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS parts_cost NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

-- 6) Cadastro de parceiro: "plan" antigo obrigatório; o código atual usa plan_id.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'partner_signups' AND column_name = 'plan' AND column_default IS NULL) THEN
    ALTER TABLE partner_signups ALTER COLUMN plan SET DEFAULT '';
  END IF;
END $$;
