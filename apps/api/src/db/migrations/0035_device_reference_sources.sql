-- Manufacturer reference data, fetched from its official source; no invented model variants or prices.
CREATE TABLE IF NOT EXISTS device_reference_sources (
  source_url TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
