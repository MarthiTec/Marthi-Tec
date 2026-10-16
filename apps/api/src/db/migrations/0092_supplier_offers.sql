-- Cotação avançada: ofertas de fornecedores para o mesmo aparelho (preço do dia, prazo, parcelamento,
-- procedência, cores e capacidades, novo ou usado com a bateria), para comparar e escolher a melhor compra.
CREATE TABLE IF NOT EXISTS supplier_offers (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT NOT NULL,
  model TEXT NOT NULL,
  condition TEXT NOT NULL DEFAULT 'new' CHECK (condition IN ('new', 'used', 'refurbished')),
  battery_level INTEGER CHECK (battery_level BETWEEN 1 AND 100),
  capacities JSONB NOT NULL DEFAULT '[]',
  colors JSONB NOT NULL DEFAULT '[]',
  price NUMERIC(12,2) NOT NULL CHECK (price > 0),
  delivery_days INTEGER NOT NULL DEFAULT 0 CHECK (delivery_days >= 0),
  max_installments INTEGER NOT NULL DEFAULT 1 CHECK (max_installments BETWEEN 1 AND 24),
  installment_fee_percent NUMERIC(6,2) NOT NULL DEFAULT 0,
  origin TEXT NOT NULL DEFAULT '',
  warranty TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  quoted_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_supplier_offers_store ON supplier_offers(store_id, quoted_at DESC);
