-- Classification is persisted; commercial metrics must not infer demo status from names.
ALTER TABLE client_accounts ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
-- Older deployments did not contain the audit table from the initial schema.
CREATE TABLE IF NOT EXISTS audit_logs (
 id TEXT PRIMARY KEY, store_id TEXT, user_id TEXT, action TEXT NOT NULL,
 entity TEXT NOT NULL, entity_id TEXT, details JSONB DEFAULT '{}'::jsonb,
 ip TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_store ON audit_logs(store_id);
