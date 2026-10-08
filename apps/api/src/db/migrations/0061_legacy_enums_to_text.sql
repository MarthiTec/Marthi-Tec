-- O banco herdado da versão antiga (Prisma) tem colunas com listas fixas de valores (enum) que
-- não aceitam os valores que o sistema grava hoje (ex.: sales_orders.status só aceitava
-- open/sold/cancelled e a venda grava "completed", gerando "Erro interno do servidor").
-- Converte essas colunas para texto, mantendo os dados e o valor padrão. Só tabelas do sistema
-- (nomes minúsculos); as tabelas do Evolution (CamelCase) ficam como estão.
-- Cada coluna é convertida isoladamente: se uma não puder ser alterada, as demais seguem.
DO $$
DECLARE
  r record;
  def text;
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name, c.column_default
      FROM information_schema.columns c
      JOIN pg_type t ON t.typname = c.udt_name AND t.typtype = 'e'
     WHERE c.table_schema = 'public'
       AND c.table_name = lower(c.table_name)
       AND left(c.table_name, 1) <> '_'
  LOOP
    BEGIN
      IF r.column_default IS NOT NULL THEN
        EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP DEFAULT', r.table_name, r.column_name);
      END IF;
      EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE text USING %I::text', r.table_name, r.column_name, r.column_name);
      IF r.column_default IS NOT NULL THEN
        def := regexp_replace(r.column_default, '::"?[A-Za-z_]+"?$', '');
        EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT %s', r.table_name, r.column_name, def);
      END IF;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Coluna %.% mantida como estava: %', r.table_name, r.column_name, SQLERRM;
    END;
  END LOOP;
END $$;
