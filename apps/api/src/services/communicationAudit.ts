import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';

export async function beginDelivery(storeId: string | undefined, channel: 'whatsapp' | 'email', recipient: string) {
  if (!storeId) return undefined; // Platform notifications have their own audit.
  if (!pool) throw Object.assign(new Error('MarthiDB indisponível.'), { status: 503 });
  const id = randomUUID();
  await pool.query(`INSERT INTO communication_delivery_logs(id,store_id,channel,recipient,status) VALUES($1,$2,$3,$4,'pending')`, [id,storeId,channel,recipient]);
  return id;
}

export async function finishDelivery(id: string | undefined, status: 'accepted' | 'failed' | 'unknown', providerStatus?: number, messageId?: string) {
  if (!id || !pool) return;
  await pool.query(`UPDATE communication_delivery_logs SET status=$2,provider_status=$3,provider_message_id=$4,updated_at=now() WHERE id=$1`, [id,status,providerStatus || null,messageId || null]);
}
