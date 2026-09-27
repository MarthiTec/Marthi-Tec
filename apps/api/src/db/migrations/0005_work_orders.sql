-- Migration 0005: Work Orders (Ordens de Serviço)
-- Estrutura Completa de OS, Senhas (Texto e Padrão Desenho), Garantias por Peça/Serviço,
-- Checklist, Assinatura Digital, Entrega do Equipamento, Linhas e Histórico de Atividades.

DO $$ BEGIN
  CREATE TYPE os_status AS ENUM (
    'backlog', 'open', 'diagnosis', 'waiting', 'progress', 'reproved', 'ready', 'delivered', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE os_priority AS ENUM ('low', 'normal', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE os_payment_status AS ENUM (
    'pending', 'partially_paid', 'paid', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE os_line_kind AS ENUM ('part', 'labor');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE asset_disposition AS ENUM ('customer', 'purchased', 'scrapped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE os_password_type AS ENUM ('typed', 'pattern', 'none');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE os_print_model AS ENUM ('default', 'commercial');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. ORDENS DE SERVIÇO
CREATE TABLE IF NOT EXISTS work_orders (
  id                     TEXT PRIMARY KEY,
  store_id               TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id            TEXT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name          TEXT NOT NULL,
  customer_phone         TEXT NOT NULL DEFAULT '',
  customer_document      TEXT NOT NULL DEFAULT '',
  customer_email         TEXT NOT NULL DEFAULT '',
  item_name              TEXT NOT NULL,
  item_brand             TEXT NOT NULL DEFAULT '',
  item_model             TEXT NOT NULL DEFAULT '',
  item_color             TEXT NOT NULL DEFAULT '',
  item_ref               TEXT NOT NULL DEFAULT '',
  imei                   TEXT NOT NULL DEFAULT '',
  serial_number          TEXT NOT NULL DEFAULT '',
  device_password        TEXT NOT NULL DEFAULT '',
  password_type          os_password_type NOT NULL DEFAULT 'none',
  pattern_password       TEXT NOT NULL DEFAULT '', -- Sequência de pontos do padrão desenho
  accessories            TEXT NOT NULL DEFAULT '',
  condition_on_entry     TEXT NOT NULL DEFAULT '',
  defect                 TEXT NOT NULL,
  diagnosis              TEXT NOT NULL DEFAULT '',
  notes                  TEXT NOT NULL DEFAULT '',
  tech_notes             TEXT NOT NULL DEFAULT '',
  technician_id          TEXT,
  technician_name        TEXT NOT NULL DEFAULT '',
  seller_id              TEXT,
  priority               os_priority NOT NULL DEFAULT 'normal',
  status                 os_status NOT NULL DEFAULT 'open',
  labor_price            NUMERIC(12,2) NOT NULL DEFAULT 0,
  parts_price            NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount               NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_mode          discount_mode NOT NULL DEFAULT 'money',
  surcharge              NUMERIC(12,2) NOT NULL DEFAULT 0,
  surcharge_mode         discount_mode NOT NULL DEFAULT 'money',
  total                  NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_amount            NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_status         os_payment_status NOT NULL DEFAULT 'pending',
  warranty_days_parts    INT NOT NULL DEFAULT 90,
  warranty_days_labor    INT NOT NULL DEFAULT 90,
  warranty_terms         TEXT NOT NULL DEFAULT '',
  print_model            os_print_model NOT NULL DEFAULT 'default',
  print_two_copies       BOOLEAN NOT NULL DEFAULT true,
  show_qr_code           BOOLEAN NOT NULL DEFAULT true,
  entry_checklist        JSONB NOT NULL DEFAULT '[]'::jsonb,
  exit_checklist         JSONB NOT NULL DEFAULT '[]'::jsonb,
  customer_signature     TEXT NOT NULL DEFAULT '',
  customer_signed_at     TIMESTAMPTZ,
  customer_signed_name   TEXT NOT NULL DEFAULT '',
  asset_disposition      asset_disposition NOT NULL DEFAULT 'customer',
  estimated_ready_at     TIMESTAMPTZ,
  progress_started_at    TIMESTAMPTZ,
  delivered_at           TIMESTAMPTZ,
  delivered_to_name      TEXT NOT NULL DEFAULT '',
  delivered_to_document  TEXT NOT NULL DEFAULT '',
  delivered_notes        TEXT NOT NULL DEFAULT '',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_orders_store ON work_orders(store_id, status);
CREATE INDEX IF NOT EXISTS idx_work_orders_customer ON work_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_created ON work_orders(store_id, created_at DESC);

-- 2. LINHAS DA ORDEM DE SERVIÇO (PEÇAS E SERVIÇOS)
CREATE TABLE IF NOT EXISTS work_order_lines (
  id             TEXT PRIMARY KEY,
  work_order_id  TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  stock_id       TEXT REFERENCES stock_items(id) ON DELETE SET NULL,
  kind           os_line_kind NOT NULL DEFAULT 'part',
  name           TEXT NOT NULL,
  qty            NUMERIC(12,3) NOT NULL CHECK (qty > 0),
  unit_cost      NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_price     NUMERIC(12,2) NOT NULL DEFAULT 0,
  total          NUMERIC(12,2) NOT NULL DEFAULT 0,
  warranty_days  INT NOT NULL DEFAULT 90,
  warranty_terms TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wo_lines_wo ON work_order_lines(work_order_id);
CREATE INDEX IF NOT EXISTS idx_wo_lines_stock ON work_order_lines(stock_id);

-- 3. HISTÓRICO DE ATIVIDADES E AUDITORIA DA OS
CREATE TABLE IF NOT EXISTS work_order_activities (
  id            TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  operator_name TEXT NOT NULL,
  action        TEXT NOT NULL,
  from_status   TEXT,
  to_status     TEXT,
  notes         TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wo_activities_wo ON work_order_activities(work_order_id, created_at DESC);
