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
  return physical - Number(r.rows[0].qty);
}
