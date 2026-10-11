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
