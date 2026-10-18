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
