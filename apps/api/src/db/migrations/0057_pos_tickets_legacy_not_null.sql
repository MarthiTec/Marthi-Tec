-- Em produção, pos_tickets já existia antes da 0001 (CREATE TABLE IF NOT EXISTS não a recriou)
-- e traz colunas legadas obrigatórias sem valor padrão (ex.: payment). O pedido do totem guarda
-- pagamento, parcelas e preço em configuration, então essas colunas antigas bloqueavam todo
-- INSERT com "null value in column payment". Só removemos a obrigatoriedade; nenhum dado muda.
DO $$
DECLARE
  legacy RECORD;
BEGIN
  FOR legacy IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'pos_tickets'
      AND is_nullable = 'NO'
      AND column_default IS NULL
      AND column_name NOT IN ('id', 'store_id')
  LOOP
    EXECUTE format('ALTER TABLE pos_tickets ALTER COLUMN %I DROP NOT NULL', legacy.column_name);
  END LOOP;
END $$;
