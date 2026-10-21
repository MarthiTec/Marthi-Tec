import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import {
  AUDIT_ACTION_TYPE_LABELS,
  AUDIT_MODULE_LABELS,
  mapAuditRow,
  writeAuditLog,
  type AuditActionType,
  type AuditModuleKey,
} from '../services/auditLogWriter.js';

/**
 * Trilha de atividades da loja (audit_logs). Sem secrets no payload de resposta.
 */
export const auditLogsRouter = Router();

const actionTypeEnum = z.enum(['inclusao', 'alteracao', 'exclusao', 'conclusao']);

auditLogsRouter.get('/api/v1/audit-logs', requireAuth, async (req, res, next) => {
  try {
    if (!pool) throw Object.assign(new Error('MarthiDB indisponível.'), { status: 503 });
    const query = z
      .object({
        action: z.string().trim().max(80).optional(),
        entity: z.string().trim().max(80).optional(),
        module: z.string().trim().max(80).optional(),
        menu: z.string().trim().max(120).optional(),
        actionType: actionTypeEnum.optional(),
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
    if (query.module) {
      conditions.push(`(module = $${idx} OR details->>'module' = $${idx})`);
      values.push(query.module);
      idx += 1;
    }
    if (query.menu) {
      conditions.push(`(menu_label ILIKE $${idx} OR details->>'menuLabel' ILIKE $${idx})`);
      values.push(`%${query.menu}%`);
      idx += 1;
    }
    if (query.actionType) {
      conditions.push(`(action_type = $${idx} OR details->>'actionType' = $${idx})`);
      values.push(query.actionType);
      idx += 1;
    }
    values.push(query.limit);

    const result = await pool.query(
      `SELECT id, store_id, user_id, action, entity, entity_id, details, created_at,
              module, menu_label, action_type
         FROM audit_logs
        WHERE ${conditions.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT $${idx}`,
      values,
    );

    res.json({
      success: true,
      data: result.rows.map((row) => mapAuditRow(row)),
      meta: {
        modules: Object.entries(AUDIT_MODULE_LABELS).map(([value, label]) => ({ value, label })),
        actionTypes: Object.entries(AUDIT_ACTION_TYPE_LABELS).map(([value, label]) => ({
          value,
          label,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Registro manual / bridge do front (acessos e ações que ainda passam pelo Nest UI trail).
 * Persistido em MarthiDB — sem mocks.
 */
auditLogsRouter.post('/api/v1/audit-logs', requireAuth, async (req, res, next) => {
  try {
    if (!pool) throw Object.assign(new Error('MarthiDB indisponível.'), { status: 503 });
    const body = z
      .object({
        action: z.string().trim().min(1).max(120),
        entity: z.string().trim().min(1).max(80).default('ui'),
        entityId: z.string().trim().max(120).optional().nullable(),
        actionType: actionTypeEnum.default('alteracao'),
        module: z.string().trim().min(1).max(80).default('sistema'),
        menuLabel: z.string().trim().max(160).optional(),
        summary: z.string().trim().max(400).optional(),
        path: z.string().trim().max(240).optional(),
        kind: z.enum(['access', 'action']).optional(),
        details: z.record(z.unknown()).optional(),
      })
      .parse(req.body);

    const moduleKey = (Object.keys(AUDIT_MODULE_LABELS).includes(body.module)
      ? body.module
      : body.kind === 'access'
        ? 'acessos'
        : 'sistema') as AuditModuleKey;

    const id = await writeAuditLog(pool, {
      storeId: req.storeId!,
      userId: req.user?.id ?? null,
      action: body.action,
      entity: body.entity,
      entityId: body.entityId ?? null,
      actionType: body.actionType as AuditActionType,
      module: moduleKey,
      menuLabel: body.menuLabel || (body.path ? body.path : undefined),
      summary: body.summary,
      details: {
        ...(body.details ?? {}),
        path: body.path || undefined,
        kind: body.kind || 'action',
      },
      ip: req.ip || null,
      actorName: req.user?.name || null,
      actorEmail: req.user?.email || null,
    });

    const row = await pool.query(
      `SELECT id, store_id, user_id, action, entity, entity_id, details, created_at,
              module, menu_label, action_type
         FROM audit_logs WHERE id = $1`,
      [id],
    );

    res.status(201).json({ success: true, data: mapAuditRow(row.rows[0]) });
  } catch (error) {
    next(error);
  }
});
