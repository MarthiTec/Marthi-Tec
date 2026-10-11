-- Meta "até bater": sem data final; termina na venda que atinge o valor da meta.
ALTER TABLE sales_goals ALTER COLUMN end_date DROP NOT NULL;
