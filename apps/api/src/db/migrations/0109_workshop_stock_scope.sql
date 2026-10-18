-- Estoque da oficina: peças de manutenção ficam separadas do estoque da loja (não aparecem na
-- Retaguarda; a entrada e o controle são feitos pela OS). Itens já ligados a uma qualidade do
-- catálogo de manutenções passam a ser da oficina.
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'store';
UPDATE stock_items s SET scope = 'workshop'
 WHERE s.scope = 'store'
   AND EXISTS (
     SELECT 1
       FROM repair_services r,
            jsonb_array_elements(CASE WHEN jsonb_typeof(r.options) = 'array' THEN r.options ELSE '[]'::jsonb END) o
      WHERE r.store_id = s.store_id AND o->>'stockItemId' = s.id
   );
CREATE INDEX IF NOT EXISTS stock_items_scope_idx ON stock_items (store_id, scope);
