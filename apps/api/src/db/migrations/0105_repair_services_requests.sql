-- Orçamento de manutenção: catálogo de serviços por modelo (painel) e solicitações vindas do catálogo
-- digital, que viram OS (work_orders) só depois da avaliação presencial e da aprovação do cliente.

CREATE TABLE IF NOT EXISTS repair_services (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  -- Preço do serviço sem opções; NULL = "valor sob avaliação".
  price NUMERIC(12,2),
  estimated_minutes INTEGER,
  active BOOLEAN NOT NULL DEFAULT true,
  internal_notes TEXT NOT NULL DEFAULT '',
  -- Peças / qualidades: [{ id, name, price (null = sob avaliação), stockItemId, active }]
  options JSONB NOT NULL DEFAULT '[]',
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS repair_services_model_idx ON repair_services (store_id, brand, model);

CREATE TABLE IF NOT EXISTS repair_requests (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  protocol TEXT NOT NULL,
  catalog_id TEXT,
  request_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  customer_id TEXT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  phone_digits TEXT NOT NULL,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  -- O que o cliente escolheu (cópia do catálogo no momento do pedido).
  items JSONB NOT NULL DEFAULT '[]',
  estimated_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  has_evaluation BOOLEAN NOT NULL DEFAULT false,
  description TEXT NOT NULL DEFAULT '',
  -- Avaliação presencial: dados completados pela equipe, serviços finais, valor, previsão, aprovação.
  evaluation JSONB NOT NULL DEFAULT '{}',
  history JSONB NOT NULL DEFAULT '[]',
  work_order_id TEXT,
  converted_at TIMESTAMPTZ,
  converted_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT repair_requests_status_check CHECK (status IN ('pending', 'awaiting_device', 'evaluating', 'awaiting_approval', 'converted', 'cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS repair_requests_seq_uq ON repair_requests (store_id, seq);
CREATE UNIQUE INDEX IF NOT EXISTS repair_requests_protocol_uq ON repair_requests (store_id, protocol);
CREATE UNIQUE INDEX IF NOT EXISTS repair_requests_key_uq ON repair_requests (store_id, request_key) WHERE request_key IS NOT NULL;
-- Uma solicitação vira no máximo uma OS.
CREATE UNIQUE INDEX IF NOT EXISTS repair_requests_work_order_uq ON repair_requests (work_order_id) WHERE work_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS repair_requests_status_idx ON repair_requests (store_id, status, created_at DESC);

-- O link do catálogo pode mostrar (ou não) o "Solicitar manutenção".
ALTER TABLE sales_catalogs ADD COLUMN IF NOT EXISTS show_repairs BOOLEAN NOT NULL DEFAULT true;
