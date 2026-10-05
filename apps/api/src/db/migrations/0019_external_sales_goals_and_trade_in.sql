-- ============================================================================
-- 0019_external_sales_goals_and_trade_in.sql
-- Marthi - Módulo de Metas, Venda Externa (Sem Caixa), Trade-in (Upgrade) e Recolhimento
-- ============================================================================

-- 1. Estender sales_orders com campos de venda externa, custos, trade-in e recolhimento
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS sale_type TEXT NOT NULL DEFAULT 'pos';
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS cost_total NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS gross_profit NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS margin_percent NUMERIC(6,2) NOT NULL DEFAULT 0;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS trade_in_value NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS trade_in_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS external_cash_status TEXT NOT NULL DEFAULT 'not_applicable';
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS warranty_terms TEXT NOT NULL DEFAULT '';
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS warranty_months INT NOT NULL DEFAULT 3;

-- 2. Estender sales_order_lines com custo unitário e total congelados no momento da venda
ALTER TABLE sales_order_lines ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE sales_order_lines ADD COLUMN IF NOT EXISTS total_cost NUMERIC(12,2) NOT NULL DEFAULT 0;

-- 3. Tabela de Metas (Sales Goals) configurável por empresa
CREATE TABLE IF NOT EXISTS sales_goals (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  goal_type TEXT NOT NULL DEFAULT 'revenue', -- 'revenue', 'profit', 'sales_count', 'products_count'
  target_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  seller_id TEXT REFERENCES sellers(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  progressive_tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  commission_rules JSONB NOT NULL DEFAULT '{"enabled": true, "percent": 10, "type": "percent_revenue", "requires_goal_reached": true}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_goals_store ON sales_goals(store_id, active);
CREATE INDEX IF NOT EXISTS idx_sales_goals_dates ON sales_goals(store_id, start_date, end_date);

-- 4. Tabela de Aparelhos Usados Recebidos em Troca (Trade-in / Upgrade)
CREATE TABLE IF NOT EXISTS sale_trade_ins (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL,
  imei TEXT NOT NULL DEFAULT '',
  capacity TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  condition_state TEXT NOT NULL DEFAULT 'used',
  notes TEXT NOT NULL DEFAULT '',
  trade_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock_item_id TEXT REFERENCES stock_items(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'received', -- 'received', 'inspected', 'resold'
  received_by_seller_id TEXT REFERENCES sellers(id) ON DELETE SET NULL,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trade_ins_sale ON sale_trade_ins(sale_id);
CREATE INDEX IF NOT EXISTS idx_trade_ins_store ON sale_trade_ins(store_id);

-- 5. Tabela de Recolhimentos / Retiradas de Valores (Gilvan Teodo)
CREATE TABLE IF NOT EXISTS cash_pickups (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  responsible_name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  origin TEXT NOT NULL DEFAULT 'vendas_externas',
  payment_method TEXT NOT NULL DEFAULT 'dinheiro',
  pickup_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT NOT NULL DEFAULT '',
  finance_entry_id TEXT REFERENCES finance_entries(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_pickups_store ON cash_pickups(store_id, pickup_date DESC);
