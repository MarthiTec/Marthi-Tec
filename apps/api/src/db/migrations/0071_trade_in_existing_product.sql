-- Aparelho recebido na troca (venda externa) entra no produto que já existe com o mesmo nome.
-- Guardamos isso para o cancelamento tirar só a unidade da troca (e não inativar o produto).
ALTER TABLE sale_trade_ins ADD COLUMN IF NOT EXISTS stock_merged BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sale_trade_ins ADD COLUMN IF NOT EXISTS stock_attributes JSONB NOT NULL DEFAULT '[]'::jsonb;
