-- Venda externa com mais de um meio de pagamento (ex.: PIX + cartão em 4x).
-- Juros do cartão de cada pagamento (a correção da venda recalcula a partir do valor combinado).
ALTER TABLE sale_payments ADD COLUMN IF NOT EXISTS card_interest NUMERIC(12,2) NOT NULL DEFAULT 0;
-- Parte da venda paga em dinheiro (aguardando recolhimento). NULL = venda antiga, toda no mesmo meio.
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS cash_amount NUMERIC(12,2);
