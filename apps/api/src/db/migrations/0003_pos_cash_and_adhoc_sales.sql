-- Migration 0003: POS, Cash Register Sessions, and Ad-Hoc Sales
-- Terminais, Sessões de Caixa, Movimentações, Vendas, Itens, Venda Avulsa e Splits de Pagamento.

DO $$ BEGIN
  CREATE TYPE cash_session_status AS ENUM ('open', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE cash_event_type AS ENUM (
    'open', 'aporte', 'sangria', 'sale', 'exchange', 'vale', 'close', 'drawer'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE sale_status AS ENUM ('completed', 'cancelled', 'draft');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE sale_line_type AS ENUM ('product', 'ad_hoc');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE discount_mode AS ENUM ('money', 'percent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. TERMINAIS DE CAIXA
CREATE TABLE IF NOT EXISTS pos_terminals (
  id                            TEXT PRIMARY KEY,
  store_id                      TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name                          TEXT NOT NULL,
  code                          TEXT NOT NULL,
  allow_edit_unit_price         BOOLEAN NOT NULL DEFAULT false,
  require_password_delete_item  BOOLEAN NOT NULL DEFAULT false,
  require_password_cancel_sale  BOOLEAN NOT NULL DEFAULT false,
  ad_hoc_enabled                BOOLEAN NOT NULL DEFAULT true,
  scale_enabled                 BOOLEAN NOT NULL DEFAULT false,
  active                        BOOLEAN NOT NULL DEFAULT true,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_terminal_store_code UNIQUE (store_id, code)
);

CREATE INDEX IF NOT EXISTS idx_terminals_store ON pos_terminals(store_id);

-- 2. SESSÕES DE CAIXA
CREATE TABLE IF NOT EXISTS cash_sessions (
  id                TEXT PRIMARY KEY,
  store_id          TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  terminal_id       TEXT REFERENCES pos_terminals(id) ON DELETE SET NULL,
  operator_id       TEXT,
  operator_name     TEXT NOT NULL,
  opened_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at         TIMESTAMPTZ,
  opening_float     NUMERIC(12,2) NOT NULL DEFAULT 0,
  expected_cash     NUMERIC(12,2) NOT NULL DEFAULT 0,
  counted_cash      NUMERIC(12,2),
  difference        NUMERIC(12,2) NOT NULL DEFAULT 0,
  status            cash_session_status NOT NULL DEFAULT 'open',
  closing_breakdown JSONB,
  reopen_count      INT NOT NULL DEFAULT 0,
  notes             TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_sessions_store ON cash_sessions(store_id, status);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_opened ON cash_sessions(store_id, opened_at DESC);

-- 3. MOVIMENTAÇÕES DE CAIXA (SANGRIA, APORTE, ETC)
CREATE TABLE IF NOT EXISTS cash_session_events (
  id               TEXT PRIMARY KEY,
  session_id       TEXT NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
  store_id         TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  type             cash_event_type NOT NULL,
  amount           NUMERIC(12,2) NOT NULL DEFAULT 0,
  cash_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  reason           TEXT NOT NULL DEFAULT '',
  note             TEXT NOT NULL DEFAULT '',
  beneficiary_type TEXT,
  beneficiary_name TEXT,
  order_id         TEXT,
  operator_name    TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_events_session ON cash_session_events(session_id);
CREATE INDEX IF NOT EXISTS idx_cash_events_store ON cash_session_events(store_id, created_at DESC);

-- 4. VENDAS (SALES ORDERS)
CREATE TABLE IF NOT EXISTS sales_orders (
  id                 TEXT PRIMARY KEY,
  local_id           TEXT NOT NULL,
  store_id           TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  session_id         TEXT REFERENCES cash_sessions(id) ON DELETE SET NULL,
  terminal_id        TEXT REFERENCES pos_terminals(id) ON DELETE SET NULL,
  customer_id        TEXT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name      TEXT NOT NULL DEFAULT 'Consumidor Final',
  customer_document  TEXT NOT NULL DEFAULT '',
  customer_phone     TEXT NOT NULL DEFAULT '',
  seller_id          TEXT,
  seller_name        TEXT NOT NULL DEFAULT '',
  operator_name      TEXT NOT NULL DEFAULT '',
  subtotal           NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount           NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_mode      discount_mode NOT NULL DEFAULT 'money',
  surcharge          NUMERIC(12,2) NOT NULL DEFAULT 0,
  surcharge_mode     discount_mode NOT NULL DEFAULT 'money',
  total              NUMERIC(12,2) NOT NULL DEFAULT 0,
  status             sale_status NOT NULL DEFAULT 'completed',
  is_ad_hoc_sale     BOOLEAN NOT NULL DEFAULT false,
  linked_os_id       TEXT,
  linked_quote_id    TEXT,
  cancelled_at       TIMESTAMPTZ,
  cancel_reason      TEXT,
  cancel_operator    TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_sale_store_local UNIQUE (store_id, local_id)
);

CREATE INDEX IF NOT EXISTS idx_sales_orders_store ON sales_orders(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_orders_session ON sales_orders(session_id);

-- 5. ITENS DA VENDA (COM SUPORTE NATIVO À VENDA AVULSA)
CREATE TABLE IF NOT EXISTS sales_order_lines (
  id                  TEXT PRIMARY KEY,
  sale_id             TEXT NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  stock_id            TEXT REFERENCES stock_items(id) ON DELETE SET NULL, -- NULL quando for Venda Avulsa
  item_type           sale_line_type NOT NULL DEFAULT 'product',
  name                TEXT NOT NULL, -- Nome do produto ou descrição informada no caixa
  sku                 TEXT NOT NULL DEFAULT '',
  unit                TEXT NOT NULL DEFAULT 'UN',
  qty                 NUMERIC(12,3) NOT NULL CHECK (qty > 0),
  base_price          NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_price          NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_discount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_discount_mode  discount_mode NOT NULL DEFAULT 'money',
  line_surcharge      NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_surcharge_mode discount_mode NOT NULL DEFAULT 'money',
  total               NUMERIC(12,2) NOT NULL DEFAULT 0,
  imei                TEXT NOT NULL DEFAULT '',
  promo_label         TEXT NOT NULL DEFAULT '',
  promo_explanation   TEXT NOT NULL DEFAULT '',
  campaign_id         TEXT,
  CONSTRAINT chk_ad_hoc_stock CHECK (item_type <> 'ad_hoc' OR stock_id IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_sale_lines_sale ON sales_order_lines(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_lines_stock ON sales_order_lines(stock_id);

-- 6. FORMAS DE PAGAMENTO DA VENDA (MÚLTIPLOS MEIOS / SPLIT)
CREATE TABLE IF NOT EXISTS sale_payments (
  id                TEXT PRIMARY KEY,
  sale_id           TEXT NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  payment_method_id TEXT REFERENCES payment_methods(id) ON DELETE SET NULL,
  method_name       TEXT NOT NULL,
  type              payment_type NOT NULL DEFAULT 'cash',
  amount            NUMERIC(12,2) NOT NULL DEFAULT 0,
  installments      INT NOT NULL DEFAULT 1,
  tendered          NUMERIC(12,2) NOT NULL DEFAULT 0,
  change_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sale_payments_sale ON sale_payments(sale_id);

-- 7. PERSISTÊNCIA DE VENDAS EM ANDAMENTO (RECUPERAÇÃO PÓS-QUEDA)
CREATE TABLE IF NOT EXISTS pos_draft_sales (
  local_id       TEXT PRIMARY KEY,
  store_id       TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  terminal_id    TEXT NOT NULL,
  operator_name  TEXT NOT NULL,
  operator_email TEXT,
  customer_data  JSONB NOT NULL DEFAULT '{}'::jsonb,
  lines_data     JSONB NOT NULL DEFAULT '[]'::jsonb,
  splits_data    JSONB NOT NULL DEFAULT '[]'::jsonb,
  status         TEXT NOT NULL DEFAULT 'in_progress',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_draft_store ON pos_draft_sales(store_id, status);
