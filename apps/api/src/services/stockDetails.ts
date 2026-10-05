import type {PoolClient} from 'pg';
export async function stockDetails(db:Pick<PoolClient,'query'>,storeId:string,rows:any[]){
 if(!rows.length)return rows;
 const result=await db.query(`SELECT s.id,s.avg_cost,s.pricing_policy,e.* FROM stock_items s
 LEFT JOIN LATERAL (
 SELECT m.id AS movement_id,m.created_at AS entered_at,m.ref_type,m.qty AS entry_qty,m.unit_cost,m.notes,
 i.id AS invoice_id,i.number AS invoice_number,i.series AS invoice_series,i.issue_date AS invoice_issued_at,i.details->>'movementAt' AS invoice_movement_at,i.status AS invoice_status
 FROM stock_movements m LEFT JOIN stock_invoices i ON i.id=m.ref_id AND i.store_id=m.store_id
 WHERE m.store_id=s.store_id AND m.stock_id=s.id AND m.type='in'
 AND (i.id IS NULL OR i.status<>'cancelled') AND m.ref_type NOT IN ('invoice_reversal','commercial_reversal','trade_in_reversal','sale_cancel')
 ORDER BY m.created_at DESC,m.id DESC LIMIT 1) e ON true
 WHERE s.store_id=$1 AND s.id=ANY($2::text[])`,[storeId,rows.map(r=>r.id)]);
 const details=new Map(result.rows.map(r=>[r.id,r]));
 return rows.map(row=>{const d=details.get(row.id);return {...row,avg_cost:d?.avg_cost??row.cost,pricing_policy:d?.pricing_policy??{},last_entry:d?.movement_id?{movementId:d.movement_id,enteredAt:d.entered_at,origin:d.ref_type,qty:Number(d.entry_qty),unitCost:Number(d.unit_cost),notes:d.notes,invoice:d.invoice_id?{id:d.invoice_id,number:d.invoice_number,series:d.invoice_series,issuedAt:d.invoice_issued_at,movementAt:d.invoice_movement_at,status:d.invoice_status}:null}:null};});
}
