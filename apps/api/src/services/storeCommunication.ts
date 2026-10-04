import { pool } from '../db/pool.js';
import type { Request, Response, NextFunction } from 'express';

export function requireCommunicationAdmin(req: Request, res: Response, next: NextFunction) {
  if (!['admin', 'superadmin'].includes(req.user?.role || '')) {
    res.status(403).json({ success: false, error: { message: 'Somente administradores podem gerenciar a comunicação da loja.' } });
    return;
  }
  next();
}

export async function readStoreCommunication(storeId: string, column: 'whatsapp_settings' | 'smtp_settings') {
  if (!pool) throw Object.assign(new Error('MarthiDB indisponível.'), { status: 503 });
  const result = await pool.query(`SELECT ${column} AS settings FROM stores WHERE id = $1 AND active = true`, [storeId]);
  if (!result.rows[0]) throw Object.assign(new Error('Loja indisponível.'), { status: 404 });
  const raw = result.rows[0].settings;
  return typeof raw === 'string' ? JSON.parse(raw) : raw || {};
}

export async function saveStoreCommunication(storeId: string, column: 'whatsapp_settings' | 'smtp_settings', config: unknown) {
  if (!pool) throw Object.assign(new Error('MarthiDB indisponível.'), { status: 503 });
  const result = await pool.query(`UPDATE stores SET ${column} = $1::jsonb, updated_at = now() WHERE id = $2 AND active = true RETURNING id`, [JSON.stringify(config), storeId]);
  if (!result.rows[0]) throw Object.assign(new Error('Loja indisponível.'), { status: 404 });
}

export async function getStoreWhatsAppConfig(storeId: string) {
  const raw = await readStoreCommunication(storeId, 'whatsapp_settings');
  return { enabled: false, baseUrl: '', instance: '', apiKey: '', storeNumber: '', notifyCustomer: false, locationLabel: '', ...raw };
}
