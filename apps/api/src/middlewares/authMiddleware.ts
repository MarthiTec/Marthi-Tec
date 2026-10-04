import type { NextFunction, Request, Response } from 'express';
import { verifySessionToken, type AuthUser } from '../services/authService.js';
import { pool } from '../db/pool.js';

export type TenantContext = {
  user: AuthUser;
  clientAccountId: string;
  storeId: string;
  planId: 'bronze' | 'silver' | 'golden';
  userLimit: number;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      clientAccountId?: string;
      storeId?: string;
      planId?: 'bronze' | 'silver' | 'golden';
      userLimit?: number;
    }
  }
}

export function getPlanUserLimit(planId: string): number {
  const norm = (planId || '').toLowerCase().trim();
  switch (norm) {
    case 'bronze':
    case 'start':
      return 10;
    case 'silver':
    case 'growth':
      return 20;
    case 'golden':
    case 'scale':
      return 50;
    default:
      return 10;
  }
}

/** Autenticação e isolamento de tenant resolvidos exclusivamente no banco. */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ') || !header.slice(7).trim()) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Token ausente ou inválido.' } });
    return;
  }
  let user: AuthUser;
  try { user = await verifySessionToken(header.slice(7).trim()); }
  catch (error) {
    if ((error as { status?: number }).status === 503) return next(error);
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Sessão inválida ou expirada.' } });
    return;
  }
  try {
    if (!pool) throw Object.assign(new Error('MarthiDB indisponível.'), { status: 503 });
    if (!user.clientAccountId) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Usuário sem conta vinculada.' } });
      return;
    }
    const requestedStore = req.header('x-store-id')?.trim();
    const stores = await pool.query(
      `SELECT s.id, us.role FROM stores s JOIN user_stores us ON us.store_id = s.id
       WHERE us.user_id = $1 AND s.client_account_id = $2 AND s.active = true
       AND ($3::text IS NULL OR s.id = $3)
       ORDER BY us.is_default DESC, s.created_at ASC LIMIT 1`,
      [user.id, user.clientAccountId, requestedStore || null],
    );
    if (!stores.rows[0]) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Sem acesso à loja solicitada.' } });
      return;
    }
    const license = await pool.query(
      'SELECT plan_id FROM store_licenses WHERE store_id = $1 AND client_account_id = $2 AND status = $3 ORDER BY created_at DESC LIMIT 1',
      [stores.rows[0].id, user.clientAccountId, 'active'],
    );
    const rawPlan = license.rows[0]?.plan_id;
    req.user = { ...user, role: user.role === 'superadmin' ? 'superadmin' : stores.rows[0].role || 'operator' };
    req.clientAccountId = user.clientAccountId;
    req.storeId = stores.rows[0].id;
    req.planId = rawPlan === 'golden' || rawPlan === 'scale' ? 'golden' : rawPlan === 'silver' || rawPlan === 'growth' ? 'silver' : 'bronze';
    req.userLimit = getPlanUserLimit(req.planId);
    next();
  } catch (error) { next(Object.assign(new Error('Falha ao consultar MarthiDB.'), { status: 503 })); }
}

export const requireOrDemoAuth = requireAuth;

export async function requireSession(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ') || !header.slice(7).trim()) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Token ausente.' } });
    return;
  }
  try {
    req.user = await verifySessionToken(header.slice(7).trim());
    next();
  } catch (error) {
    if ((error as { status?: number }).status === 503) return next(error);
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Sessão inválida ou expirada.' } });
  }
}

export function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'superadmin') {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Acesso administrativo restrito.' } });
    return;
  }
  next();
}
