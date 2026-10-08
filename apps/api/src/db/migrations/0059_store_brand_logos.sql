-- Ícone de cada marca (Apple, Samsung, Xiaomi…) para a vitrine do totem.
-- logo_source: 'upload' (enviado pela loja), 'auto' (buscado pelo nome da marca) ou vazio.
ALTER TABLE store_brands ADD COLUMN IF NOT EXISTS logo TEXT;
ALTER TABLE store_brands ADD COLUMN IF NOT EXISTS logo_source TEXT NOT NULL DEFAULT '';
