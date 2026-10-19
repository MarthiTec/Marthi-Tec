import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middlewares/authMiddleware.js';

/**
 * Trilha de atividades da loja (audit_logs). Sem secrets no payload de resposta.
 */
export const auditLogsRouter = Router();

const SECRET_KEY = /password|passwd|secret|token|authorization|apikey|api_key|credential|smtp|jwt|hash|salt|connection.?string|database_url/i;

function scrubValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'string') {
    if (value.length > 500) return `${value.slice(0, 120)}…`;
    return value;
  }
  if (Array.isArray(value)) return value.slice(0, 50).map(scrubValue);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY.test(key)) {
        out[key] = '[redacted]';
        continue;
      }
      out[key] = scrubValue(child);
    }
    return out;
  }
  return value;
}

auditLogsRouter.get('/api/v1/audit-logs', requireAuth, async (req, res, next) => {
  try {
    if (!pool) throw Object.assign(new Error('MarthiDB indisponível.'), { status: 503 });
    const query = z
      .object({
        action: z.string().trim().max(80).optional(),
        entity: z.string().trim().max(80).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(req.query);

    const conditions = ['store_id = $1'];
    const values: unknown[] = [req.storeId];
    let idx = 2;
    if (query.action) {
      conditions.push(`action ILIKE $${idx++}`);
      values.push(`%${query.action}%`);
    }
    if (query.entity) {
      conditions.push(`entity ILIKE $${idx++}`);
      values.push(`%${query.entity}%`);
    }
    values.push(query.limit);

    const result = await pool.query(
      `SELECT id, store_id, user_id, action, entity, entity_id, details, created_at
         FROM audit_logs
        WHERE ${conditions.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT $${idx}`,
      values,
    );

    res.json({
      success: true,
      data: result.rows.map((row) => ({
        id: row.id,
        action: row.action,
        entity: row.entity,
        entityId: row.entity_id,
        userId: row.user_id,
        createdAt: row.created_at,
        details: scrubValue(row.details ?? {}),
      })),
    });
  } catch (error) {
    next(error);
  }
});
