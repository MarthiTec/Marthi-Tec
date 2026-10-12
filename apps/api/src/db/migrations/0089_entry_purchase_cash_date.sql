-- Compra paga na própria entrada de estoque: a saída do caixa vai para a data da entrada (antes ficava
-- no dia do lançamento e caía no mês errado da DRE). Só mexe na baixa feita junto com a entrada
-- (mesmo momento da conta); compra paga depois mantém a data real do pagamento. Idempotente.
UPDATE finance_entries f
   SET created_at = (e.entry_date::text || 'T12:00:00-03:00')::timestamptz
  FROM payables p
  JOIN stock_supplier_entries e ON e.payable_id = p.id AND e.store_id = p.store_id
 WHERE f.ref_id = p.id
   AND f.store_id = p.store_id
   AND f.type = 'out'
   AND f.category = 'Compra de mercadorias'
   AND p.notes LIKE 'Lançado pela entrada de estoque%'
   AND abs(extract(epoch FROM (f.created_at::timestamptz - p.created_at::timestamptz))) < 120
   AND (f.created_at::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date <> e.entry_date;
