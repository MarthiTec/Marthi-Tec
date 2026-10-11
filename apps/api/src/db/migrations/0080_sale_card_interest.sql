-- Juros do cartão repassados na venda: ficam separados do acréscimo para o comprovante do cliente
-- mostrar só o valor combinado (os juros são informação da loja).
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS card_interest NUMERIC(12,2) NOT NULL DEFAULT 0;
