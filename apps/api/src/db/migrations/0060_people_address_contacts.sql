-- [0059_store_brand_logos.sql]
-- Ícone de cada marca (Apple, Samsung, Xiaomi…) para a vitrine do totem.
-- logo_source: 'upload' (enviado pela loja), 'auto' (buscado pelo nome da marca) ou vazio.
ALTER TABLE store_brands ADD COLUMN IF NOT EXISTS logo TEXT;
ALTER TABLE store_brands ADD COLUMN IF NOT EXISTS logo_source TEXT NOT NULL DEFAULT '';

-- [0060_people_address_contacts.sql]
-- Cadastro de pessoas mais completo: endereço inteiro, pessoa física/jurídica e vários telefones
-- e e-mails para clientes, fornecedores e vendedores; vendedor responsável pelo cliente.
-- Só acrescenta colunas com padrão: nada existente é alterado.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS seller_id TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS extra_phones JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS extra_emails JSONB NOT NULL DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS idx_customers_seller ON customers(store_id, seller_id);

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS document_type TEXT NOT NULL DEFAULT 'cnpj';
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS zip_code TEXT NOT NULL DEFAULT '';
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS street TEXT NOT NULL DEFAULT '';
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS number TEXT NOT NULL DEFAULT '';
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS complement TEXT NOT NULL DEFAULT '';
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS district TEXT NOT NULL DEFAULT '';
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT '';
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS extra_phones JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS extra_emails JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE sellers ADD COLUMN IF NOT EXISTS document_type TEXT NOT NULL DEFAULT 'cpf';
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS zip_code TEXT NOT NULL DEFAULT '';
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS street TEXT NOT NULL DEFAULT '';
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS number TEXT NOT NULL DEFAULT '';
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS complement TEXT NOT NULL DEFAULT '';
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS district TEXT NOT NULL DEFAULT '';
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS city TEXT NOT NULL DEFAULT '';
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT '';
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS extra_phones JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS extra_emails JSONB NOT NULL DEFAULT '[]'::jsonb;
