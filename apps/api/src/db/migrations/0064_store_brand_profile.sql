-- Dados da loja para comprovantes e mensagens: logo, redes sociais, site e assinatura.
-- Telefone e e-mail já existem na tabela stores.
ALTER TABLE stores ADD COLUMN IF NOT EXISTS logo TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS instagram TEXT NOT NULL DEFAULT '';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS facebook TEXT NOT NULL DEFAULT '';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS website TEXT NOT NULL DEFAULT '';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS message_signature TEXT NOT NULL DEFAULT '';
