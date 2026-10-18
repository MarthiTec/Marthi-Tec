-- [0090_sale_revisions.sql]
-- Correções de vendas já concluídas: quem alterou, quando, por quê e a venda completa antes e depois.
CREATE TABLE IF NOT EXISTS sale_revisions (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  sale_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  operator_name TEXT NOT NULL DEFAULT '',
  before JSONB NOT NULL,
  after JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sale_revisions_sale ON sale_revisions(store_id, sale_id, created_at DESC);

-- [0091_customer_rg.sql]
-- RG do cliente: a ficha de venda da loja pede nome, CPF, RG, telefone e endereço.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS rg TEXT NOT NULL DEFAULT '';

-- [0092_supplier_offers.sql]
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

-- [0093_employee_home_area.sql]
-- Sistema que abre quando o usuário entra (PDV, OS, Retaguarda...). Vazio = automático pelas áreas liberadas.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS home_area TEXT NOT NULL DEFAULT '';

-- [0094_store_credits_exchanges.sql]
-- Vale-compra e trocas do PDV no banco (antes ficavam só no navegador do caixa).
CREATE TABLE IF NOT EXISTS store_credits (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  remaining NUMERIC(12,2) NOT NULL CHECK (remaining >= 0),
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'used', 'cancelled')),
  order_id TEXT,
  session_id TEXT REFERENCES cash_sessions(id) ON DELETE SET NULL,
  operator_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, code)
);
CREATE INDEX IF NOT EXISTS idx_store_credits_store ON store_credits(store_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cash_exchanges (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL DEFAULT '',
  customer_name TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  return_lines JSONB NOT NULL DEFAULT '[]',
  out_lines JSONB NOT NULL DEFAULT '[]',
  return_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  out_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  cash_delta NUMERIC(12,2) NOT NULL DEFAULT 0,
  credit_id TEXT REFERENCES store_credits(id) ON DELETE SET NULL,
  session_id TEXT REFERENCES cash_sessions(id) ON DELETE SET NULL,
  note TEXT NOT NULL DEFAULT '',
  operator_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cash_exchanges_store ON cash_exchanges(store_id, created_at DESC);

-- [0095_stock_interest_free.sql]
-- Juros no cartão por produto: 0 = com juros (padrão, a taxa da maquininha vai para o cliente);
-- N = sem juros até N parcelas (acima disso, volta a ter juros).
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS interest_free_installments INT NOT NULL DEFAULT 0;
DO $$ BEGIN
  ALTER TABLE stock_items ADD CONSTRAINT stock_items_interest_free_range CHECK (interest_free_installments BETWEEN 0 AND 24);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- [0096_entry_imei_pairs.sql]
-- Aparelho com dois IMEIs (dual chip): { IMEI principal: segundo IMEI } por entrada.
-- O principal continua em "imeis" (é ele que conta como unidade); o segundo não muda a quantidade.
ALTER TABLE stock_supplier_entries ADD COLUMN IF NOT EXISTS imei_pairs JSONB NOT NULL DEFAULT '{}';

-- [0097_trade_evaluations.sql]
-- Avaliação interna do aparelho de troca: o vendedor pede, a oficina avalia (sem custo para o cliente)
-- e o vendedor aprova ou recusa o preço sugerido. Não é OS: não gera orçamento nem financeiro.
CREATE TABLE IF NOT EXISTS trade_evaluations (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'evaluated', 'approved', 'rejected', 'canceled')),
  customer_id TEXT,
  customer_name TEXT NOT NULL DEFAULT '',
  device_name TEXT NOT NULL DEFAULT '',
  imei TEXT NOT NULL DEFAULT '',
  capacity TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  request_notes TEXT NOT NULL DEFAULT '',
  requested_by TEXT NOT NULL DEFAULT '',
  requested_by_email TEXT NOT NULL DEFAULT '',
  battery_level INTEGER CHECK (battery_level BETWEEN 0 AND 100),
  opened BOOLEAN,
  cracked BOOLEAN,
  evaluation_notes TEXT NOT NULL DEFAULT '',
  suggested_price NUMERIC(12,2),
  evaluated_by TEXT NOT NULL DEFAULT '',
  evaluated_at TIMESTAMPTZ,
  approved_price NUMERIC(12,2),
  decision_notes TEXT NOT NULL DEFAULT '',
  decided_by TEXT NOT NULL DEFAULT '',
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trade_evaluations_store_status ON trade_evaluations(store_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_evaluations_store_imei ON trade_evaluations(store_id, imei);

-- [0098_split_payments.sql]
-- Venda externa com mais de um meio de pagamento (ex.: PIX + cartão em 4x).
-- Juros do cartão de cada pagamento (a correção da venda recalcula a partir do valor combinado).
ALTER TABLE sale_payments ADD COLUMN IF NOT EXISTS card_interest NUMERIC(12,2) NOT NULL DEFAULT 0;
-- Parte da venda paga em dinheiro (aguardando recolhimento). NULL = venda antiga, toda no mesmo meio.
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS cash_amount NUMERIC(12,2);

-- [0099_sales_catalogs.sql]
-- Catálogo de produtos para o cliente: a loja escolhe os produtos e a capa; o cliente abre por um link
-- público (token) com foto, nome e preço sempre atuais do estoque.
CREATE TABLE IF NOT EXISTS sales_catalogs (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Catálogo',
  subtitle TEXT NOT NULL DEFAULT '',
  show_cover BOOLEAN NOT NULL DEFAULT true,
  cover_style TEXT NOT NULL DEFAULT 'diagonal' CHECK (cover_style IN ('diagonal', 'band')),
  cover_image TEXT NOT NULL DEFAULT '',
  accent TEXT NOT NULL DEFAULT '#e4572e',
  show_prices BOOLEAN NOT NULL DEFAULT true,
  hide_sold_out BOOLEAN NOT NULL DEFAULT true,
  note TEXT NOT NULL DEFAULT '',
  product_ids JSONB NOT NULL DEFAULT '[]',
  token TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_catalogs_store ON sales_catalogs(store_id, updated_at DESC);

-- [0100_catalog_orders.sql]
-- Pedido feito pelo cliente no catálogo (celular): cadastro do cliente, produtos, aparelho de troca e
-- preferência de pagamento. Cai na fila da venda externa; a loja aprova o cadastro e finaliza a venda.
-- kind 'signup' = só o cadastro do cliente (sem produto).
CREATE TABLE IF NOT EXISTS catalog_orders (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  catalog_id TEXT REFERENCES sales_catalogs(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'order' CHECK (kind IN ('order', 'signup')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_service', 'sold', 'cancelled')),
  customer JSONB NOT NULL DEFAULT '{}',
  customer_id TEXT,
  -- Vendedor que o cliente disse que o atendeu (meta e comissão).
  seller_id TEXT,
  items JSONB NOT NULL DEFAULT '[]',
  trade_in JSONB,
  payment TEXT NOT NULL DEFAULT '',
  installments INTEGER NOT NULL DEFAULT 1,
  fulfillment TEXT NOT NULL DEFAULT 'store',
  notes TEXT NOT NULL DEFAULT '',
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  sale_id TEXT,
  handled_by TEXT NOT NULL DEFAULT '',
  cancel_reason TEXT NOT NULL DEFAULT '',
  request_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_catalog_orders_store ON catalog_orders(store_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_orders_request ON catalog_orders(store_id, request_key) WHERE request_key IS NOT NULL;

-- [0101_catalog_include_order.sql]
-- Catálogo: produtos sob encomenda (sem unidade na loja, mas com encomenda) entram sempre, mesmo sem
-- marcar, inclusive os cadastrados depois. Ligado por padrão.
ALTER TABLE sales_catalogs ADD COLUMN IF NOT EXISTS include_order_products BOOLEAN NOT NULL DEFAULT true;

-- [0102_product_specs_video.sql]
-- Página de venda: vídeo do aparelho e ficha técnica (opcionais) no cadastro do produto, e os produtos
-- em destaque de cada catálogo.
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS video_url TEXT NOT NULL DEFAULT '';
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS specs JSONB NOT NULL DEFAULT '[]';
ALTER TABLE sales_catalogs ADD COLUMN IF NOT EXISTS featured_ids JSONB NOT NULL DEFAULT '[]';

-- [0103_screen_visits.sql]
-- Telas mais acessadas do painel: contador por loja + usuário + tela (atalho "Mais acessadas").
CREATE TABLE IF NOT EXISTS screen_visits (
  store_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  path TEXT NOT NULL,
  visits INTEGER NOT NULL DEFAULT 0,
  last_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, user_id, path)
);
CREATE INDEX IF NOT EXISTS screen_visits_top_idx ON screen_visits (store_id, user_id, visits DESC);

-- [0104_catalog_mode_covers_prefs.sql]
-- Catálogo digital x página de venda, capas novas e preferências de tela por usuário.
ALTER TABLE sales_catalogs ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'sales';
ALTER TABLE sales_catalogs DROP CONSTRAINT IF EXISTS sales_catalogs_mode_check;
ALTER TABLE sales_catalogs ADD CONSTRAINT sales_catalogs_mode_check CHECK (mode IN ('catalog', 'sales'));
ALTER TABLE sales_catalogs DROP CONSTRAINT IF EXISTS sales_catalogs_cover_style_check;
ALTER TABLE sales_catalogs ADD CONSTRAINT sales_catalogs_cover_style_check CHECK (cover_style IN ('diagonal', 'band', 'hero', 'minimal', 'mosaic', 'dark'));

-- Configurações de tela (filtros, aba aberta, item escolhido…) de cada usuário em cada loja.
CREATE TABLE IF NOT EXISTS user_preferences (
  store_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, user_id, key)
);

-- [0105_repair_services_requests.sql]
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

-- [0106_repair_services_product_cost.sql]
-- Manutenções ligadas ao produto (aparelho do estoque) e com custo (além do valor de venda).
ALTER TABLE repair_services ADD COLUMN IF NOT EXISTS product_id TEXT;
ALTER TABLE repair_services ADD COLUMN IF NOT EXISTS cost NUMERIC(12,2);
CREATE INDEX IF NOT EXISTS repair_services_product_idx ON repair_services (store_id, product_id);
