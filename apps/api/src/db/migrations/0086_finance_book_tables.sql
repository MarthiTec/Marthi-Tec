-- [0063_sale_warranty_type.sql]
-- Tipo de garantia da venda: da loja (com prazo), somente do fabricante, ou sem garantia.
-- Vendas antigas continuam como garantia da loja.
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS warranty_type TEXT NOT NULL DEFAULT 'store';

-- [0064_store_brand_profile.sql]
-- Dados da loja para comprovantes e mensagens: logo, redes sociais, site e assinatura.
-- Telefone e e-mail já existem na tabela stores.
ALTER TABLE stores ADD COLUMN IF NOT EXISTS logo TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS instagram TEXT NOT NULL DEFAULT '';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS facebook TEXT NOT NULL DEFAULT '';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS website TEXT NOT NULL DEFAULT '';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS message_signature TEXT NOT NULL DEFAULT '';

-- [0065_supplier_in_sku.sql]
-- Fornecedor na formação do SKU: nome curto escolhido pela loja (vazio = nome fantasia ou o
-- primeiro nome do fornecedor) e, por produto, se o fornecedor entra ou não no SKU.
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS sku_name TEXT NOT NULL DEFAULT '';
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS sku_with_supplier BOOLEAN NOT NULL DEFAULT true;

-- [0066_product_types_groups.sql]
-- Cadastro de produto: tipos de produto da loja, grupos e subgrupos (nome configurável, ex.: Família),
-- data de entrada, DUN-14 e conversão de unidade (compra em caixa, venda por unidade).

CREATE TABLE IF NOT EXISTS product_types (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS product_types_store_name ON product_types(store_id, lower(name));

-- parent_id vazio = grupo; preenchido = subgrupo daquele grupo.
CREATE TABLE IF NOT EXISTS product_groups (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES product_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS product_groups_store_parent_name ON product_groups(store_id, COALESCE(parent_id, ''), lower(name));

ALTER TABLE stores ADD COLUMN IF NOT EXISTS product_group_label TEXT NOT NULL DEFAULT 'Grupo';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS product_subgroup_label TEXT NOT NULL DEFAULT 'Subgrupo';

ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS product_type_id TEXT REFERENCES product_types(id) ON DELETE SET NULL;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS group_id TEXT REFERENCES product_groups(id) ON DELETE SET NULL;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS subgroup_id TEXT REFERENCES product_groups(id) ON DELETE SET NULL;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS entry_date DATE;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS dun14 TEXT NOT NULL DEFAULT '';
-- Ex.: compra em CX com 12 → purchase_unit 'CX', purchase_factor 12 (estoque e venda continuam na unidade).
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS purchase_unit TEXT NOT NULL DEFAULT '';
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS purchase_factor NUMERIC(12,3) NOT NULL DEFAULT 1;

-- [0067_drop_product_types.sql]
-- "Tipo de produto" saiu: a loja organiza os produtos só por grupo e subgrupo, com o nome que preferir.
-- Nenhuma loja chegou a cadastrar tipos (tabela vazia em produção quando isto foi escrito).
ALTER TABLE stock_items DROP COLUMN IF EXISTS product_type_id;
DROP TABLE IF EXISTS product_types;

-- [0068_sale_line_campaign.sql]
-- Campanha aplicada em cada item da venda (auditoria: qual campanha e quanto de desconto).
ALTER TABLE sales_order_lines ADD COLUMN IF NOT EXISTS campaign_id TEXT;
ALTER TABLE sales_order_lines ADD COLUMN IF NOT EXISTS campaign_name TEXT NOT NULL DEFAULT '';
ALTER TABLE sales_order_lines ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

-- [0069_stock_supplier_entries.sql]
-- Entradas do mesmo produto por fornecedor: cada compra tem fornecedor, data, quantidade, custo e
-- IMEIs próprios. O preço de venda continua sendo o da variação (cor/capacidade) e do tipo de retirada.
CREATE TABLE IF NOT EXISTS stock_supplier_entries (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  stock_item_id TEXT NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  -- Variação da grade (cor/capacidade); vazio = produto simples.
  variation_id TEXT,
  supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  qty INT NOT NULL CHECK (qty > 0),
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  imeis JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_supplier_entries_item ON stock_supplier_entries(store_id, stock_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_supplier_entries_supplier ON stock_supplier_entries(store_id, supplier_id);

-- [0070_platform_support.sql]
-- Contatos de suporte da Marthi (aparecem na Central de ajuda de todas as lojas) e pedidos de ajuste
-- registrados pelas lojas. Os contatos ficam no banco e o superadmin pode alterar.
CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO platform_settings (key, value) VALUES (
  'support_contacts',
  jsonb_build_object(
    'email', 'marthi.tecnologia@gmail.com',
    'instagram', 'marthi.tecnologia',
    'whatsapp', '5524981244253',
    'address', 'Shopping Olga Sola · Centro · Três Rios — RJ'
  )
) ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id TEXT,
  user_name TEXT NOT NULL DEFAULT '',
  user_email TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_store ON support_tickets(store_id, created_at DESC);

-- [0071_trade_in_existing_product.sql]
-- Aparelho recebido na troca (venda externa) entra no produto que já existe com o mesmo nome.
-- Guardamos isso para o cancelamento tirar só a unidade da troca (e não inativar o produto).
ALTER TABLE sale_trade_ins ADD COLUMN IF NOT EXISTS stock_merged BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sale_trade_ins ADD COLUMN IF NOT EXISTS stock_attributes JSONB NOT NULL DEFAULT '[]'::jsonb;

-- [0072_condition_battery.sql]
-- Condição (novo, usado, recondicionado) com nível de bateria por variação e no produto simples.
-- Novo = 100%. A condição e a bateria aparecem no totem, a não ser que a loja desligue no produto.
ALTER TABLE stock_item_variations ADD COLUMN IF NOT EXISTS battery_level INT CHECK (battery_level IS NULL OR (battery_level BETWEEN 0 AND 100));
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS battery_level INT CHECK (battery_level IS NULL OR (battery_level BETWEEN 0 AND 100));
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS show_condition_on_totem BOOLEAN NOT NULL DEFAULT true;

-- [0073_supplier_entry_details.sql]
-- Entradas de estoque com bateria por aparelho e origem: compra de fornecedor ou aparelho recebido
-- na troca da venda externa (o "fornecedor" é o cliente). ref_id liga a entrada à troca (para estornar).
ALTER TABLE stock_supplier_entries ADD COLUMN IF NOT EXISTS battery_level INT CHECK (battery_level IS NULL OR (battery_level BETWEEN 0 AND 100));
ALTER TABLE stock_supplier_entries ADD COLUMN IF NOT EXISTS customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE stock_supplier_entries ADD COLUMN IF NOT EXISTS customer_name TEXT NOT NULL DEFAULT '';
ALTER TABLE stock_supplier_entries ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'supplier';
ALTER TABLE stock_supplier_entries ADD COLUMN IF NOT EXISTS ref_id TEXT;
CREATE INDEX IF NOT EXISTS idx_stock_supplier_entries_ref ON stock_supplier_entries(store_id, ref_id);

-- [0074_simple_stock_catalog.sql]
-- Cadastro simplificado de produtos:
--  * Tipos por marca (Apple → IPHONE, IPAD, MACBOOK…) e Modelos por tipo (IPHONE → 15 PRO MAX…).
--    Linhas com store_id vazio são o catálogo da plataforma (todas as lojas veem); cada loja pode
--    acrescentar os seus. Marca + Tipo + Modelo montam a descrição do produto.
--  * Origem do fornecedor: Empresa ou Upgrade (aparelho recebido na troca).
--  * Quem cadastrou o produto.
--  * Modo do estoque da loja: simplificado ou padrão (lojas de celular/assistência: simplificado).

CREATE TABLE IF NOT EXISTS catalog_types (
  id TEXT PRIMARY KEY,
  store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
  brand_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  sort INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_catalog_types_brand ON catalog_types(brand_slug);
CREATE UNIQUE INDEX IF NOT EXISTS catalog_types_unique ON catalog_types(COALESCE(store_id, ''), brand_slug, lower(name));

CREATE TABLE IF NOT EXISTS catalog_models (
  id TEXT PRIMARY KEY,
  store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
  type_id TEXT NOT NULL REFERENCES catalog_types(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_catalog_models_type ON catalog_models(type_id);
CREATE UNIQUE INDEX IF NOT EXISTS catalog_models_unique ON catalog_models(COALESCE(store_id, ''), type_id, lower(name));

ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS catalog_type_id TEXT REFERENCES catalog_types(id) ON DELETE SET NULL;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS catalog_model_id TEXT REFERENCES catalog_models(id) ON DELETE SET NULL;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS created_by_id TEXT;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS created_by_name TEXT NOT NULL DEFAULT '';

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'company';

ALTER TABLE stores ADD COLUMN IF NOT EXISTS stock_mode TEXT NOT NULL DEFAULT 'standard';
UPDATE stores SET stock_mode = 'simple' WHERE segment = 'assistencia_tecnica' AND stock_mode = 'standard';

-- Catálogo da plataforma: tipos por marca.
INSERT INTO catalog_types (id, store_id, brand_slug, name, sort) VALUES
  ('CT-APPLE-IPHONE', NULL, 'apple', 'IPHONE', 1),
  ('CT-APPLE-IPAD', NULL, 'apple', 'IPAD', 2),
  ('CT-APPLE-MACBOOK', NULL, 'apple', 'MACBOOK', 3),
  ('CT-APPLE-IMAC', NULL, 'apple', 'IMAC', 4),
  ('CT-APPLE-WATCH', NULL, 'apple', 'APPLE WATCH', 5),
  ('CT-APPLE-AIRPODS', NULL, 'apple', 'AIRPODS', 6),
  ('CT-APPLE-EARPODS', NULL, 'apple', 'EARPODS', 7),
  ('CT-APPLE-TV', NULL, 'apple', 'APPLE TV', 8),
  ('CT-SAMSUNG-GALAXY-S', NULL, 'samsung', 'GALAXY S', 1),
  ('CT-SAMSUNG-GALAXY-A', NULL, 'samsung', 'GALAXY A', 2),
  ('CT-SAMSUNG-GALAXY-Z', NULL, 'samsung', 'GALAXY Z', 3),
  ('CT-SAMSUNG-GALAXY-TAB', NULL, 'samsung', 'GALAXY TAB', 4),
  ('CT-SAMSUNG-GALAXY-WATCH', NULL, 'samsung', 'GALAXY WATCH', 5),
  ('CT-SAMSUNG-GALAXY-BUDS', NULL, 'samsung', 'GALAXY BUDS', 6),
  ('CT-XIAOMI-REDMI', NULL, 'xiaomi', 'REDMI', 1),
  ('CT-XIAOMI-REDMI-NOTE', NULL, 'xiaomi', 'REDMI NOTE', 2),
  ('CT-XIAOMI-POCO', NULL, 'xiaomi', 'POCO', 3),
  ('CT-XIAOMI-XIAOMI', NULL, 'xiaomi', 'XIAOMI', 4),
  ('CT-MOTOROLA-MOTO-G', NULL, 'motorola', 'MOTO G', 1),
  ('CT-MOTOROLA-MOTO-E', NULL, 'motorola', 'MOTO E', 2),
  ('CT-MOTOROLA-EDGE', NULL, 'motorola', 'EDGE', 3),
  ('CT-MOTOROLA-RAZR', NULL, 'motorola', 'RAZR', 4),
  ('CT-REALME-REALME', NULL, 'realme', 'REALME', 1),
  ('CT-REALME-NOTE', NULL, 'realme', 'REALME NOTE', 2),
  ('CT-REALME-C', NULL, 'realme', 'REALME C', 3)
ON CONFLICT (id) DO NOTHING;

-- Modelos: o nome não repete o tipo (IPHONE + "15 PRO MAX" = "IPHONE 15 PRO MAX").
INSERT INTO catalog_models (id, store_id, type_id, name, sort)
SELECT 'CM-IPHONE-' || regexp_replace(upper(m.name), '[^A-Z0-9]+', '-', 'g'), NULL, 'CT-APPLE-IPHONE', m.name, m.sort
FROM (VALUES
  ('XR', 1), ('XS', 2), ('XS MAX', 3),
  ('11', 4), ('11 PRO', 5), ('11 PRO MAX', 6),
  ('SE 2ª GERAÇÃO', 7), ('SE 3ª GERAÇÃO', 8),
  ('12 MINI', 9), ('12', 10), ('12 PRO', 11), ('12 PRO MAX', 12),
  ('13 MINI', 13), ('13', 14), ('13 PRO', 15), ('13 PRO MAX', 16),
  ('14', 17), ('14 PLUS', 18), ('14 PRO', 19), ('14 PRO MAX', 20),
  ('15', 21), ('15 PLUS', 22), ('15 PRO', 23), ('15 PRO MAX', 24),
  ('16E', 25), ('16', 26), ('16 PLUS', 27), ('16 PRO', 28), ('16 PRO MAX', 29),
  ('17', 30), ('17 AIR', 31), ('17 PRO', 32), ('17 PRO MAX', 33),
  ('18', 34), ('18 PRO', 35), ('18 PRO MAX', 36)
) AS m(name, sort)
ON CONFLICT (id) DO NOTHING;

INSERT INTO catalog_models (id, store_id, type_id, name, sort) VALUES
  ('CM-IPAD-PADRAO', NULL, 'CT-APPLE-IPAD', '10ª GERAÇÃO', 1),
  ('CM-IPAD-A16', NULL, 'CT-APPLE-IPAD', '11ª GERAÇÃO (A16)', 2),
  ('CM-IPAD-MINI', NULL, 'CT-APPLE-IPAD', 'MINI', 3),
  ('CM-IPAD-AIR', NULL, 'CT-APPLE-IPAD', 'AIR', 4),
  ('CM-IPAD-PRO', NULL, 'CT-APPLE-IPAD', 'PRO', 5),
  ('CM-MACBOOK-AIR', NULL, 'CT-APPLE-MACBOOK', 'AIR', 1),
  ('CM-MACBOOK-PRO', NULL, 'CT-APPLE-MACBOOK', 'PRO', 2),
  ('CM-WATCH-SE', NULL, 'CT-APPLE-WATCH', 'SE', 1),
  ('CM-WATCH-S9', NULL, 'CT-APPLE-WATCH', 'SERIES 9', 2),
  ('CM-WATCH-S10', NULL, 'CT-APPLE-WATCH', 'SERIES 10', 3),
  ('CM-WATCH-S11', NULL, 'CT-APPLE-WATCH', 'SERIES 11', 4),
  ('CM-WATCH-ULTRA2', NULL, 'CT-APPLE-WATCH', 'ULTRA 2', 5),
  ('CM-WATCH-ULTRA3', NULL, 'CT-APPLE-WATCH', 'ULTRA 3', 6),
  ('CM-AIRPODS-2', NULL, 'CT-APPLE-AIRPODS', '2', 1),
  ('CM-AIRPODS-3', NULL, 'CT-APPLE-AIRPODS', '3', 2),
  ('CM-AIRPODS-4', NULL, 'CT-APPLE-AIRPODS', '4', 3),
  ('CM-AIRPODS-PRO2', NULL, 'CT-APPLE-AIRPODS', 'PRO 2', 4),
  ('CM-AIRPODS-PRO3', NULL, 'CT-APPLE-AIRPODS', 'PRO 3', 5),
  ('CM-AIRPODS-MAX', NULL, 'CT-APPLE-AIRPODS', 'MAX', 6),
  ('CM-EARPODS-USBC', NULL, 'CT-APPLE-EARPODS', 'USB-C', 1),
  ('CM-EARPODS-LIGHTNING', NULL, 'CT-APPLE-EARPODS', 'LIGHTNING', 2),
  ('CM-EARPODS-P2', NULL, 'CT-APPLE-EARPODS', 'P2 (3,5 MM)', 3)
ON CONFLICT (id) DO NOTHING;

-- [0075_stock_sold_units.sql]
-- Controle por IMEI: cada saída de aparelho do estoque fica registrada — venda (marcada pela venda,
-- pelo IMEI informado ou, sem IMEI, pela entrada mais antiga), bonificação, uso interno ou perda.
-- Cancelar a venda ou estornar a baixa não apaga o registro: marca reverted_at, e o aparelho volta a
-- "em estoque" mantendo o histórico do IMEI.
CREATE TABLE IF NOT EXISTS stock_sold_units (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  stock_item_id TEXT NOT NULL,
  variation_id TEXT,
  entry_id TEXT REFERENCES stock_supplier_entries(id) ON DELETE SET NULL,
  imei TEXT NOT NULL DEFAULT '',
  -- sale | bonus (bonificação) | internal (uso interno) | loss (perda/defeito)
  kind TEXT NOT NULL DEFAULT 'sale',
  sale_id TEXT,
  sale_line_id TEXT,
  unit_price NUMERIC(12,2),
  notes TEXT NOT NULL DEFAULT '',
  operator_name TEXT NOT NULL DEFAULT '',
  sold_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reverted_at TIMESTAMPTZ,
  reverted_reason TEXT NOT NULL DEFAULT '',
  reverted_by TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_stock_sold_units_item ON stock_sold_units(store_id, stock_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_sold_units_entry ON stock_sold_units(entry_id);
CREATE INDEX IF NOT EXISTS idx_stock_sold_units_sale ON stock_sold_units(store_id, sale_id);
CREATE INDEX IF NOT EXISTS idx_stock_sold_units_imei ON stock_sold_units(store_id, imei);
-- O mesmo IMEI não pode ter duas saídas ativas na loja.
CREATE UNIQUE INDEX IF NOT EXISTS stock_sold_units_active_imei ON stock_sold_units(store_id, imei) WHERE imei <> '' AND reverted_at IS NULL;

-- Compra lançada no financeiro (contas a pagar) a partir da entrada do fornecedor.
ALTER TABLE stock_supplier_entries ADD COLUMN IF NOT EXISTS payable_id TEXT;

-- [0076_order_arrival_reminders.sql]
-- Lembrete de chegada da encomenda: no dia previsto (venda com retirada "encomenda" ou encomenda da
-- tela Encomendas & Ofertas), a partir da hora configurada (padrão 10h), o sistema manda WhatsApp para
-- o cliente avisando que o produto está a caminho e um lembrete para o número da loja.
-- Cada lembrete fica registrado (uma vez por encomenda e data), com o resultado do envio.
ALTER TABLE stores ADD COLUMN IF NOT EXISTS order_reminder_settings JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS order_reminders (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  -- pickup = venda com retirada por encomenda; commercial = Encomendas & Ofertas
  source TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  reminder_date DATE NOT NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  product_name TEXT NOT NULL DEFAULT '',
  customer_message TEXT NOT NULL DEFAULT '',
  store_message TEXT NOT NULL DEFAULT '',
  customer_status TEXT NOT NULL DEFAULT 'pending',
  store_status TEXT NOT NULL DEFAULT 'pending',
  error TEXT NOT NULL DEFAULT '',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, source, ref_id, reminder_date)
);
CREATE INDEX IF NOT EXISTS idx_order_reminders_store ON order_reminders(store_id, reminder_date DESC);

-- [0077_stock_unit_outputs_upgrade.sql]
-- Atualiza bancos que aplicaram a primeira versão da 0075 (só vendas, registro apagado no cancelamento):
-- tipos de saída (bonificação, uso interno, perda), estorno sem apagar o histórico e compra no financeiro.
-- Em bancos novos a 0075 já cria tudo e estes comandos não mudam nada.
ALTER TABLE stock_sold_units ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'sale';
ALTER TABLE stock_sold_units ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2);
ALTER TABLE stock_sold_units ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
ALTER TABLE stock_sold_units ADD COLUMN IF NOT EXISTS operator_name TEXT NOT NULL DEFAULT '';
ALTER TABLE stock_sold_units ADD COLUMN IF NOT EXISTS reverted_at TIMESTAMPTZ;
ALTER TABLE stock_sold_units ADD COLUMN IF NOT EXISTS reverted_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE stock_sold_units ADD COLUMN IF NOT EXISTS reverted_by TEXT NOT NULL DEFAULT '';
ALTER TABLE stock_sold_units ALTER COLUMN sale_id DROP NOT NULL;

-- O IMEI só não pode ter duas saídas ATIVAS (estornadas ficam no histórico).
DROP INDEX IF EXISTS stock_sold_units_imei;
CREATE UNIQUE INDEX IF NOT EXISTS stock_sold_units_active_imei ON stock_sold_units(store_id, imei) WHERE imei <> '' AND reverted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_stock_sold_units_imei ON stock_sold_units(store_id, imei);

-- Preço das vendas já marcadas, para o relatório por IMEI.
UPDATE stock_sold_units u SET unit_price = l.unit_price
  FROM sales_order_lines l
 WHERE l.id = u.sale_line_id AND u.unit_price IS NULL;

ALTER TABLE stock_supplier_entries ADD COLUMN IF NOT EXISTS payable_id TEXT;

-- [0078_marthi_ads.sql]
-- Marthi ADS (Fase 1: Meta/Facebook). Conexões com provedores de anúncio, campanhas criadas a partir
-- do cadastro de produtos, mídias, resultados e auditoria — tudo por loja. Tokens ficam só
-- criptografados (AES-256-GCM, chave META_TOKEN_KEY) e nunca saem do servidor.

-- Pedido de conexão (OAuth): `state` de uso único, preso à loja e ao usuário, com validade curta.
CREATE TABLE IF NOT EXISTS ads_oauth_states (
  state TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  user_id TEXT NOT NULL DEFAULT '',
  user_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

-- Conexão da loja com o provedor (uma por loja e provedor).
CREATE TABLE IF NOT EXISTS ads_connections (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  -- connected | needs_reconnect | revoked | error
  status TEXT NOT NULL DEFAULT 'connected',
  external_user_id TEXT NOT NULL DEFAULT '',
  external_user_name TEXT NOT NULL DEFAULT '',
  token_enc TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  page_id TEXT,
  page_name TEXT NOT NULL DEFAULT '',
  page_token_enc TEXT,
  ad_account_id TEXT,
  ad_account_name TEXT NOT NULL DEFAULT '',
  ad_account_currency TEXT NOT NULL DEFAULT '',
  ad_account_timezone TEXT NOT NULL DEFAULT '',
  ad_account_status INT,
  instagram_id TEXT,
  instagram_username TEXT NOT NULL DEFAULT '',
  last_error TEXT NOT NULL DEFAULT '',
  last_checked_at TIMESTAMPTZ,
  connected_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, provider)
);

-- Campanha do Marthi (um anúncio de um produto). Os IDs da Meta ficam em `external` e são gravados a
-- cada etapa criada, para retomar sem duplicar.
CREATE TABLE IF NOT EXISTS ads_campaigns (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'meta',
  product_id TEXT NOT NULL,
  variation_id TEXT,
  name TEXT NOT NULL,
  objective TEXT NOT NULL DEFAULT 'traffic',
  destination_url TEXT NOT NULL,
  -- título, texto, chamada para ação, mídia escolhida (cópia editável — não altera o cadastro)
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- cidades/raio, idade, posicionamentos
  audience JSONB NOT NULL DEFAULT '{}'::jsonb,
  budget_type TEXT NOT NULL DEFAULT 'daily',
  budget_minor BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  -- O que o Marthi pediu (rascunho, pausado, ativo) x o que a Meta informa (effective_status).
  requested_status TEXT NOT NULL DEFAULT 'draft',
  -- draft | submitting | submitted | error
  submit_state TEXT NOT NULL DEFAULT 'draft',
  submit_step TEXT NOT NULL DEFAULT '',
  submit_key TEXT,
  external JSONB NOT NULL DEFAULT '{}'::jsonb,
  effective_status TEXT NOT NULL DEFAULT '',
  review_feedback JSONB,
  issues JSONB,
  last_error TEXT NOT NULL DEFAULT '',
  authorized_by TEXT NOT NULL DEFAULT '',
  authorized_at TIMESTAMPTZ,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_synced_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ads_campaigns_store ON ads_campaigns(store_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ads_campaigns_submit_key ON ads_campaigns(store_id, submit_key) WHERE submit_key IS NOT NULL;

-- Fotos e vídeos do lojista para anúncios. Imagem guardada aqui; vídeo vai direto para a conta de
-- anúncios (guardamos o ID da Meta e a miniatura).
CREATE TABLE IF NOT EXISTS ads_media (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  mime TEXT NOT NULL DEFAULT '',
  size_bytes BIGINT NOT NULL DEFAULT 0,
  width INT,
  height INT,
  duration_sec NUMERIC(10,2),
  data_url TEXT,
  provider TEXT,
  external_id TEXT,
  external_status TEXT NOT NULL DEFAULT '',
  thumbnail_url TEXT NOT NULL DEFAULT '',
  rights_confirmed BOOLEAN NOT NULL DEFAULT false,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ads_media_store ON ads_media(store_id, created_at DESC);

-- Resultados consultados na Meta (com o horário da consulta).
CREATE TABLE IF NOT EXISTS ads_insights (
  campaign_id TEXT NOT NULL REFERENCES ads_campaigns(id) ON DELETE CASCADE,
  date_preset TEXT NOT NULL,
  data JSONB,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, date_preset)
);

-- Auditoria de tudo que mexe com conexão, envio e gasto.
CREATE TABLE IF NOT EXISTS ads_audit (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  actor TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  entity_id TEXT NOT NULL DEFAULT '',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ads_audit_store ON ads_audit(store_id, created_at DESC);

-- Pedidos de exclusão de dados vindos da Meta (callback oficial).
CREATE TABLE IF NOT EXISTS ads_data_deletions (
  confirmation_code TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  external_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'done',
  stores_affected INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- [0079_store_ibge_city_code.sql]
-- Código IBGE do município da loja (NF-e/NFC-e). Vem da busca por CEP e fica salvo no cadastro da loja.
ALTER TABLE stores ADD COLUMN IF NOT EXISTS ibge_city_code TEXT NOT NULL DEFAULT '';

-- [0080_sale_card_interest.sql]
-- Juros do cartão repassados na venda: ficam separados do acréscimo para o comprovante do cliente
-- mostrar só o valor combinado (os juros são informação da loja).
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS card_interest NUMERIC(12,2) NOT NULL DEFAULT 0;

-- [0081_sale_seller_changes.sql]
-- Troca do vendedor de uma venda já concluída (metas e comissões passam para o vendedor certo),
-- com histórico de quem trocou e quando.
CREATE TABLE IF NOT EXISTS sale_seller_changes (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  sale_id TEXT NOT NULL,
  from_seller_id TEXT,
  from_seller_name TEXT NOT NULL DEFAULT '',
  to_seller_id TEXT NOT NULL,
  to_seller_name TEXT NOT NULL DEFAULT '',
  changed_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sale_seller_changes_sale ON sale_seller_changes(store_id, sale_id, created_at DESC);

-- [0082_sales_goals_open_ended.sql]
-- Meta "até bater": sem data final; termina na venda que atinge o valor da meta.
ALTER TABLE sales_goals ALTER COLUMN end_date DROP NOT NULL;

-- [0083_meta_store_connection_and_social_posts.sql]
-- Conexão Meta por loja (a loja informa o token do app/usuário de sistema dela, como na Evolution)
-- e publicações programadas no Instagram (orgânicas, sem custo).
ALTER TABLE ads_connections ADD COLUMN IF NOT EXISTS connection_mode TEXT NOT NULL DEFAULT 'oauth';

CREATE TABLE IF NOT EXISTS ads_social_posts (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  network TEXT NOT NULL DEFAULT 'instagram',
  caption TEXT NOT NULL DEFAULT '',
  media_id TEXT REFERENCES ads_media(id) ON DELETE SET NULL,
  -- scheduled | publishing | published | failed | cancelled
  status TEXT NOT NULL DEFAULT 'scheduled',
  scheduled_at TIMESTAMPTZ NOT NULL,
  published_at TIMESTAMPTZ,
  container_id TEXT NOT NULL DEFAULT '',
  external_id TEXT NOT NULL DEFAULT '',
  permalink TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  attempts INT NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ads_social_posts_store ON ads_social_posts(store_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_ads_social_posts_due ON ads_social_posts(status, scheduled_at);

-- [0084_trade_in_preexisting_stock.sql]
-- Troca cujo aparelho já tinha entrada manual na loja (mesmo IMEI): a venda só registra o crédito,
-- e o cancelamento não mexe no estoque desse aparelho.
ALTER TABLE sale_trade_ins ADD COLUMN IF NOT EXISTS stock_preexisting BOOLEAN NOT NULL DEFAULT false;

-- [0085_totem_exit_password_no_default.sql]
-- Sem senha padrão de saída do totem: cada loja define a sua (as lojas existentes mantêm a que já têm).
ALTER TABLE stores ALTER COLUMN totem_exit_password DROP DEFAULT;
ALTER TABLE stores ALTER COLUMN totem_exit_password DROP NOT NULL;

-- [0086_finance_book_tables.sql]
-- Tesouraria e adiantamentos no mesmo formato do banco de produção (lá as tabelas já existem assim).
-- Tesouraria: data do movimento em "at"; depósito e saque usam só uma das contas.
ALTER TABLE treasury_moves ADD COLUMN IF NOT EXISTS at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE treasury_moves ALTER COLUMN from_account_id DROP NOT NULL;
ALTER TABLE treasury_moves ALTER COLUMN to_account_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_treasury_moves_store ON treasury_moves(store_id, at DESC);

-- Adiantamentos de clientes (recebidos) e a fornecedores (pagos), abatidos depois em vendas ou contas.
CREATE TABLE IF NOT EXISTS advance_payments (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('customer', 'supplier')),
  party_name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  used_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  account_id TEXT REFERENCES bank_accounts(id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_advance_payments_store ON advance_payments(store_id, created_at DESC);
