-- Consultas à API de aparelhos por dia (UTC, como a RapidAPI conta): trava para não passar do plano
-- gratuito (15/dia; acima disso a RapidAPI cobra por consulta). scope = 'platform' ou 'store:<id>'.
CREATE TABLE IF NOT EXISTS device_catalog_usage (
  scope TEXT NOT NULL,
  day DATE NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, day)
);
