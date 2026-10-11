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
