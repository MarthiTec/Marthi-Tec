-- Troca cujo aparelho já tinha entrada manual na loja (mesmo IMEI): a venda só registra o crédito,
-- e o cancelamento não mexe no estoque desse aparelho.
ALTER TABLE sale_trade_ins ADD COLUMN IF NOT EXISTS stock_preexisting BOOLEAN NOT NULL DEFAULT false;
