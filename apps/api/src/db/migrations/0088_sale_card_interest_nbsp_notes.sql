-- Igual à 0087, para observações gravadas pelo formatador de moeda: "R$ 740,00" vem com espaço
-- não separável (U+00A0), que o \s do Postgres não reconhece. Aceita qualquer separador. Idempotente.
UPDATE sales_orders
   SET card_interest = LEAST(
         surcharge,
         replace(replace((regexp_match(notes, 'Juros do cartão [0-9]+x \([^)]*\):[^0-9]{0,6}([0-9.]+,[0-9]{2})'))[1], '.', ''), ',', '.')::numeric
       )
 WHERE COALESCE(card_interest, 0) = 0
   AND surcharge > 0
   AND notes ~ 'Juros do cartão [0-9]+x \([^)]*\):[^0-9]{0,6}[0-9.]+,[0-9]{2}';

UPDATE sales_orders
   SET gross_profit = round(subtotal - discount + surcharge - card_interest - cost_total, 2),
       margin_percent = CASE WHEN subtotal - discount + surcharge - card_interest > 0
                             THEN round((subtotal - discount + surcharge - card_interest - cost_total) * 100 / (subtotal - discount + surcharge - card_interest), 2)
                             ELSE 0 END
 WHERE card_interest > 0;
