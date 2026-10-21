-- Auditoria operacional: módulo, menu e tipo de ação (inclusão/alteração/exclusão/conclusão)
-- para filtros na UI e trilha unificada MarthiDB (audit_logs).

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS module TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS menu_label TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS action_type TEXT;

DO $$ BEGIN
  ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_type_check
    CHECK (action_type IS NULL OR action_type IN ('inclusao', 'alteracao', 'exclusao', 'conclusao'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_logs_store_created ON audit_logs(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_store_module ON audit_logs(store_id, module);
CREATE INDEX IF NOT EXISTS idx_audit_logs_store_action_type ON audit_logs(store_id, action_type);
