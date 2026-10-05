-- Incident quarantine: exact generated records, unchanged price/cost/qty, no business history.
-- Preserves all rows and balances. Reactivation requires physical-stock verification.
UPDATE stock_items s SET active=false,show_on_totem=false,updated_at=now()
FROM (VALUES
 ('STK-CP-ACS-CABO1M',25,65,22),('STK-CP-ACS-CAPACLR',18,79,25),('STK-CP-ACS-FONT20W',20,120,45),('STK-CP-ACS-PEL3D',50,35,8),
 ('STK-CP-BAT-IPH13',12,240,110),('STK-CP-CON-IPH12',6,180,65),('STK-CP-IPH11',6,2299,1800),('STK-CP-IPH12',6,2799,2200),
 ('STK-CP-IPH13',10,3400,2800),('STK-CP-IPH14',7,3899,3200),('STK-CP-IPH15',11,4499,3800),('STK-CP-IPH15PM',5,5890,4900),
 ('STK-CP-IPH16P',8,6290,5300),('STK-CP-IPH16PM',7,6990,5900),('STK-CP-REDMI13P',9,2199,1700),('STK-CP-TEL-IPH13',8,580,320),('STK-CP-TEL-IPH14P',5,890,510)
) expected(id,qty,price,cost)
WHERE s.id=expected.id AND s.store_id='STR-CELL-PONTO' AND s.qty=expected.qty AND s.price=expected.price AND s.cost=expected.cost
AND NOT EXISTS(SELECT 1 FROM stock_movements m WHERE m.stock_id=s.id OR m.stock_item_id=s.id)
AND NOT EXISTS(SELECT 1 FROM sales_order_lines l WHERE l.stock_id=s.id OR l.stock_item_id=s.id)
AND NOT EXISTS(SELECT 1 FROM stock_invoice_lines l WHERE l.stock_id=s.id OR l.stock_item_id=s.id)
AND NOT EXISTS(SELECT 1 FROM pickup_requests p WHERE p.stock_id=s.id)
RETURNING s.id;
