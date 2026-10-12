-- Lucro e margem das vendas sem os juros do cartão (são da operadora, repassados ao cliente).
-- Vendas antigas guardavam os juros só nas observações ("Juros do cartão 18x (20%): R$ 740,00"):
-- o valor vai para card_interest e o lucro é recalculado. Idempotente.
UPDATE sales_orders
   SET card_interest = LEAST(
         surcharge,
         replace(replace((regexp_match(notes, 'Juros do cartão \d+x \([^)]*\):\s*R\$\s*([0-9.]+,[0-9]{2})'))[1], '.', ''), ',', '.')::numeric
       )
 WHERE COALESCE(card_interest, 0) = 0
   AND surcharge > 0
   AND notes ~ 'Juros do cartão \d+x \([^)]*\):\s*R\$\s*[0-9.]+,[0-9]{2}';

UPDATE sales_orders
   SET gross_profit = round(subtotal - discount + surcharge - card_interest - cost_total, 2),
       margin_percent = CASE WHEN subtotal - discount + surcharge - card_interest > 0
                             THEN round((subtotal - discount + surcharge - card_interest - cost_total) * 100 / (subtotal - discount + surcharge - card_interest), 2)
                             ELSE 0 END
 WHERE card_interest > 0;
