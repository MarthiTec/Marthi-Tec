import type { PoolClient } from "pg";
export async function unreservedQuantity(
  db: PoolClient,
  storeId: string,
  stockId: string,
  physical: number,
) {
  const r = await db.query(
    "SELECT COALESCE(SUM((details->>'qty')::int),0) AS qty FROM commercial_orders WHERE store_id=$1 AND details->>'stockId'=$2 AND status IN ('confirmed','purchased','in_transit','received')",
    [storeId, stockId],
  );
  const pickups=await db.query("SELECT COALESCE(SUM(p.qty),0) AS qty FROM pickup_requests p JOIN sales_orders s ON s.id=p.reference_id AND s.store_id=p.store_id WHERE p.store_id=$1 AND p.stock_id=$2 AND p.kind='order' AND p.status IN ('ready','dispatched') AND s.status<>'cancelled'",[storeId,stockId]);
  return physical - Number(r.rows[0].qty) - Number(pickups.rows[0]?.qty||0);
}
