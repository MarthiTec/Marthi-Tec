-- Migration 0056: Completa colunas da tabela work_orders para o modulo ERP / Oficina
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS customer_document TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS customer_email TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS item_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS item_brand TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS item_model TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS item_color TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS item_ref TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS device_password TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS accessories TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS condition_on_entry TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS defect TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS diagnosis TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tech_notes TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS estimated_ready_at TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS technician TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS seller_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS operation_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS labor NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS parts NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS asset_disposition TEXT NOT NULL DEFAULT 'customer',
  ADD COLUMN IF NOT EXISTS quote_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS quote_notes TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS quote_valid_until TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS quote_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quote_decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS purchase_cost NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS purchase_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS purchase_stock_id TEXT,
  ADD COLUMN IF NOT EXISTS purchase_finance_id TEXT,
  ADD COLUMN IF NOT EXISTS revenue_finance_id TEXT,
  ADD COLUMN IF NOT EXISTS progress_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS customer_signature TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS customer_signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS customer_signed_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS spent_minutes INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS comments JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS history JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS worklogs JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS lines JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Sincronizar colunas legadas se existirem valores
UPDATE work_orders SET defect = defect_description WHERE (defect = '' OR defect IS NULL) AND defect_description <> '';
UPDATE work_orders SET diagnosis = technical_report WHERE (diagnosis = '' OR diagnosis IS NULL) AND technical_report <> '';
UPDATE work_orders SET labor = labor_cost WHERE labor = 0 AND labor_cost <> 0;
UPDATE work_orders SET parts = parts_cost WHERE parts = 0 AND parts_cost <> 0;
UPDATE work_orders SET item_brand = device_brand WHERE (item_brand = '' OR item_brand IS NULL) AND device_brand <> '';
UPDATE work_orders SET item_model = device_model WHERE (item_model = '' OR item_model IS NULL) AND device_model <> '';
UPDATE work_orders SET item_ref = serial_or_imei WHERE (item_ref = '' OR item_ref IS NULL) AND serial_or_imei <> '';
