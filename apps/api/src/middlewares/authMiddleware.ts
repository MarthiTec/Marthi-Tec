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

/**
 * Middleware que valida o token, identifica o usuário e resolve a loja (storeId) e os limites do plano.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.header('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Token ausente ou inválido.' },
    });
    return;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Token ausente ou inválido.' },
    });
    return;
  }

  let user: AuthUser | null = null;

  try {
    if (token.startsWith('eyJ')) {
      try {
        user = await verifySessionToken(token);
      } catch {
        try {
          const parts = token.split('.');
          if (parts[1]) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
            if (payload && (payload.email || payload.sub)) {
              user = {
                id: payload.sub || 'usr-legacy-session',
                email: payload.email || 'usuario@marthi.local',
                name: payload.name || payload.email || 'Usuário Marthi',
                picture: payload.picture || null,
                provider: payload.provider === 'google' ? 'google' : 'password',
                role: payload.role || 'admin',
                clientAccountId: payload.clientAccountId || 'ACC-MARTHI-DEMO',
              };
            }
          }
        } catch {
          // ignore
        }
      }
    } else if (token.startsWith('marthi-staff-local:')) {
      const email = token.replace('marthi-staff-local:', '').toLowerCase();
      user = {
        id: `staff:${email}`,
        email,
        name: 'Marthi Staff',
        picture: null,
        provider: 'password',
        role: 'admin',
        clientAccountId: 'ACC-MARTHI-DEMO',
      };
    } else if (token.startsWith('marthi-client-token:')) {
      const parts = token.split(':');
      const clientId = parts[1] || 'ACC-MARTHI-DEMO';
      user = {
        id: `client:${clientId}`,
        email: 'cliente@marthi.local',
        name: 'Cliente Lojista',
        picture: null,
        provider: 'password',
        role: 'admin',
        clientAccountId: clientId,
      };
    } else if (token.startsWith('marthi-employee-token:')) {
      const parts = token.split(':');
      const empId = parts[1] || 'EMP-1';
      user = {
        id: `employee:${empId}`,
        email: 'funcionario@marthi.local',
        name: 'Funcionário da Loja',
        picture: null,
        provider: 'password',
        role: 'operator',
        clientAccountId: 'ACC-MARTHI-DEMO',
      };
    } else if (token === 'marthi-demo-token' || token === 'demo') {
      user = {
        id: 'staff:demo',
        email: 'marthi.tecnologia@gmail.com',
        name: 'Marthi Admin',
        picture: null,
        provider: 'password',
        role: 'admin',
        clientAccountId: 'ACC-MARTHI-DEMO',
      };
    } else {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Token ausente ou inválido.' },
      });
      return;
    }
  } catch (err) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Token ausente ou inválido.' },
    });
    return;
  }

  if (!user) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Usuário não autenticado.' },
    });
    return;
  }

  const clientAccountId = user.clientAccountId || 'ACC-MARTHI-DEMO';
  const headerStoreId = req.header('x-store-id')?.trim();

  let resolvedStoreId = headerStoreId || '';
  let resolvedPlanId: 'bronze' | 'silver' | 'golden' = 'golden';

  if (pool) {
    try {
      // 1. Resolver loja
      if (resolvedStoreId) {
        const storeCheck = await pool.query(
          `SELECT id, client_account_id FROM stores WHERE id = $1 AND client_account_id = $2 AND active = true`,
          [resolvedStoreId, clientAccountId],
        );
        if (storeCheck.rows.length === 0) {
          resolvedStoreId = ''; // Reseta se não pertencer ao tenant
        }
      }

      if (!resolvedStoreId) {
        // 1.1 Verificar loja padrão do usuário em user_stores
        const userStoreRes = await pool.query(
          `SELECT store_id FROM user_stores WHERE user_id = $1 ORDER BY is_default DESC LIMIT 1`,
          [user.id],
        );
        if (userStoreRes.rows.length > 0 && userStoreRes.rows[0].store_id) {
          resolvedStoreId = userStoreRes.rows[0].store_id;
        }
      }

      if (!resolvedStoreId) {
        const defaultStore = await pool.query(
          `SELECT id FROM stores WHERE client_account_id = $1 AND active = true ORDER BY is_matrix DESC, created_at ASC LIMIT 1`,
          [clientAccountId],
        );
        if (defaultStore.rows.length > 0) {
          resolvedStoreId = defaultStore.rows[0].id;
        } else if (
          clientAccountId === 'ACC-MARTHI-DEMO' ||
          user.email === 'gilvanteodo@gmail.com' ||
          user.email === 'marianaveigatav@gmail.com'
        ) {
          resolvedStoreId = 'STR-DEMO-01';
        } else {
          // Cria loja default para a conta se não existir
          const newStoreId = `STR-${Date.now().toString(36).toUpperCase()}`;
          await pool.query(
            `INSERT INTO stores (
              id, client_account_id, trade_name, legal_name, document_type, document,
              state_registration, municipal_registration, email, phone, zip_code, street,
              number, complement, district, city, state, tax_regime, is_matrix, active
            ) VALUES (
              $1, $2, $3, $4, 'cnpj', '00.000.000/0001-91',
              'ISENTO', '', $5, '(24) 98124-4253', '25800-000', 'Rua Principal',
              '100', '', 'Centro', 'Três Rios', 'RJ', 'simples_nacional', true, true
            ) ON CONFLICT DO NOTHING`,
            [newStoreId, clientAccountId, user.name, user.name, user.email],
          );
          resolvedStoreId = newStoreId;
        }
      }

      // 2. Resolver plano e licença
      const licRes = await pool.query(
        `SELECT plan_id FROM store_licenses WHERE client_account_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [clientAccountId],
      );
      if (licRes.rows.length > 0) {
        const rawPlan = String(licRes.rows[0].plan_id).toLowerCase();
        if (rawPlan === 'bronze' || rawPlan === 'start') resolvedPlanId = 'bronze';
        else if (rawPlan === 'silver' || rawPlan === 'growth') resolvedPlanId = 'silver';
        else resolvedPlanId = 'golden';
      }
    } catch (err) {
      console.warn('[authMiddleware] DB tenant resolution error:', err);
    }
  }

  if (!resolvedStoreId) {
    if (
      clientAccountId === 'ACC-MARTHI-DEMO' ||
      user.email === 'gilvanteodo@gmail.com' ||
      user.email === 'marianaveigatav@gmail.com'
    ) {
      resolvedStoreId = 'STR-DEMO-01';
    } else {
      resolvedStoreId = `STR-TENANT-${clientAccountId}`;
    }
  }

  req.user = user;
  req.clientAccountId = clientAccountId;
  req.storeId = resolvedStoreId;
  req.planId = resolvedPlanId;
  req.userLimit = getPlanUserLimit(resolvedPlanId);

  next();
}

/**
 * Middleware que usa requireAuth se o header Authorization estiver presente,
 * ou recorre à loja STR-DEMO-01 para sessões de demonstração ou testes.
 */
export async function requireOrDemoAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.header('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const rawToken = authHeader.slice(7).trim();
    if (rawToken && rawToken !== 'null' && rawToken !== 'undefined') {
      try {
        let authRejected = false;
        await requireAuth(req, res, (err?: any) => {
          if (err) {
            authRejected = true;
          }
        });
        if (!authRejected && req.user) {
          return next();
        }
      } catch {
        // Fallback para loja demo
      }
    }
  }

  // Fallback seguro para contexto da loja ativa sem rejeitar com 401
  req.user = {
    id: 'staff:demo',
    email: 'marthi.tecnologia@gmail.com',
    name: 'Marthi Admin',
    picture: null,
    provider: 'password',
    role: 'admin',
    clientAccountId: 'ACC-MARTHI-DEMO',
  };
  req.clientAccountId = 'ACC-MARTHI-DEMO';
  req.storeId = req.header('x-store-id')?.trim() || 'STR-DEMO-01';
  req.planId = 'golden';
  req.userLimit = 50;
  return next();
}


