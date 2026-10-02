-- Migration 0004: Promotional Campaigns and Commercial Quotes
-- Campanhas Promocionais, Faixas por Quantidade e Orçamentos com Congelamento de Valores.

DO $$ BEGIN
  CREATE TYPE promo_kind AS ENUM (
    'tier', 'percent', 'fixed', 'promo_price', 'buy_x_pay_y', 'gift'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE quote_status AS ENUM (
    'draft', 'open', 'sent', 'pending_approval', 'approved', 'rejected', 'expired', 'cancelled', 'converted'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. CAMPANHAS PROMOCIONAIS
CREATE TABLE IF NOT EXISTS promo_campaigns (
  id               TEXT PRIMARY KEY,
  store_id         TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  active           BOOLEAN NOT NULL DEFAULT true,
  kind             TEXT NOT NULL DEFAULT 'percent',
  criteria         JSONB NOT NULL DEFAULT '{}'::jsonb,
  discount_percent NUMERIC(5,2),
  discount_amount  NUMERIC(12,2),
  promo_price      NUMERIC(12,2),
  buy_qty          INT,
  pay_qty          INT,
  gift_stock_id    TEXT REFERENCES stock_items(id) ON DELETE SET NULL,
  gift_min_qty     INT NOT NULL DEFAULT 1,
  start_date       DATE,
  end_date         DATE,
  priority         INT NOT NULL DEFAULT 1,
  accumulative     BOOLEAN NOT NULL DEFAULT false,
  note             TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE promo_campaigns ADD COLUMN IF NOT EXISTS store_id TEXT;
  ALTER TABLE promo_campaigns ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_promos_store ON promo_campaigns(store_id, active);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 2. FAIXAS POR QUANTIDADE (TIERS)
CREATE TABLE IF NOT EXISTS promo_campaign_tiers (
  id          TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES promo_campaigns(id) ON DELETE CASCADE,
  qty         INT NOT NULL CHECK (qty > 0),
  total_price NUMERIC(12,2) NOT NULL CHECK (total_price >= 0),
  CONSTRAINT uq_tier_camp_qty UNIQUE (campaign_id, qty)
);

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_promo_tiers_camp ON promo_campaign_tiers(campaign_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 3. ORÇAMENTOS COMERCIAIS (POS QUOTES)
CREATE TABLE IF NOT EXISTS pos_quotes (
  id                 TEXT PRIMARY KEY,
  store_id           TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  quote_number       TEXT NOT NULL,
  sequence_number    INT NOT NULL DEFAULT 1,
  customer_id        TEXT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name      TEXT NOT NULL,
  customer_document  TEXT NOT NULL DEFAULT '',
  customer_phone     TEXT NOT NULL DEFAULT '',
  customer_email     TEXT NOT NULL DEFAULT '',
  customer_address   TEXT NOT NULL DEFAULT '',
  seller_id          TEXT,
  seller_name        TEXT NOT NULL DEFAULT '',
  price_table_id     TEXT REFERENCES price_tables(id) ON DELETE SET NULL,
  subtotal           NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount           NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_mode      discount_mode NOT NULL DEFAULT 'money',
  surcharge          NUMERIC(12,2) NOT NULL DEFAULT 0,
  surcharge_mode     discount_mode NOT NULL DEFAULT 'money',
  total              NUMERIC(12,2) NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'open',
  valid_until        TIMESTAMPTZ NOT NULL,
  validity_days      INT NOT NULL DEFAULT 7,
  delivery_term      TEXT NOT NULL DEFAULT '',
  payment_conditions TEXT NOT NULL DEFAULT '',
  notes              TEXT NOT NULL DEFAULT '',
  converted_sale_id  TEXT REFERENCES sales_orders(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE pos_quotes ADD COLUMN IF NOT EXISTS store_id TEXT;
  ALTER TABLE pos_quotes ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open';
  ALTER TABLE pos_quotes ADD COLUMN IF NOT EXISTS customer_id TEXT;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_quotes_store ON pos_quotes(store_id, status);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_quotes_customer ON pos_quotes(customer_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 4. ITENS DO ORÇAMENTO (COM PREÇOS E CONDIÇÕES CONGELADAS)
CREATE TABLE IF NOT EXISTS pos_quote_lines (
  id                  TEXT PRIMARY KEY,
  quote_id            TEXT NOT NULL REFERENCES pos_quotes(id) ON DELETE CASCADE,
  stock_id            TEXT REFERENCES stock_items(id) ON DELETE SET NULL,
  item_type           sale_line_type NOT NULL DEFAULT 'product',
  sku                 TEXT NOT NULL DEFAULT '',
  name                TEXT NOT NULL,
  unit                TEXT NOT NULL DEFAULT 'UN',
  qty                 NUMERIC(12,3) NOT NULL CHECK (qty > 0),
  base_price          NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_price          NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_discount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_discount_mode  discount_mode NOT NULL DEFAULT 'money',
  line_surcharge      NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_surcharge_mode discount_mode NOT NULL DEFAULT 'money',
  total               NUMERIC(12,2) NOT NULL DEFAULT 0,
  promo_label         TEXT NOT NULL DEFAULT '',
  campaign_id         TEXT,
  is_frozen_price     BOOLEAN NOT NULL DEFAULT true
);

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_quote_lines_quote ON pos_quote_lines(quote_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
