-- RG do cliente: a ficha de venda da loja pede nome, CPF, RG, telefone e endereço.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS rg TEXT NOT NULL DEFAULT '';
