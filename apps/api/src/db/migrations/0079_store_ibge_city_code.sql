-- Código IBGE do município da loja (NF-e/NFC-e). Vem da busca por CEP e fica salvo no cadastro da loja.
ALTER TABLE stores ADD COLUMN IF NOT EXISTS ibge_city_code TEXT NOT NULL DEFAULT '';
