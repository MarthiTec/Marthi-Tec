-- Cliente que não sabe o defeito: pede só a avaliação técnica (vira OS para o técnico diagnosticar).
ALTER TABLE repair_requests ADD COLUMN IF NOT EXISTS wants_diagnosis BOOLEAN NOT NULL DEFAULT false;
