import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, getPlanUserLimit } from '../middlewares/authMiddleware.js';
import { pool } from '../db/pool.js';

export const storesRouter = Router();

const storeSchema = z.object({
  id: z.string().optional(),
  tradeName: z.string().min(1, 'Nome fantasia é obrigatório.'),
  legalName: z.string().default(''),
  documentType: z.enum(['cnpj', 'cpf']).default('cnpj'),
  document: z.string().min(11, 'Documento inválido.'),
  stateRegistration: z.string().default(''),
  municipalRegistration: z.string().default(''),
  email: z.string().default(''),
  phone: z.string().default(''),
  zipCode: z.string().default(''),
  street: z.string().default(''),
  number: z.string().default(''),
  complement: z.string().default(''),
  district: z.string().default(''),
  city: z.string().default(''),
  state: z.string().default(''),
  taxRegime: z.string().default('simples_nacional'),
  isMatrix: z.boolean().default(false),
  active: z.boolean().default(true),
  discountPercent: z.coerce.number().min(0).max(100).optional(),
  accessToken: z.string().optional(),
});

const storePlanSchema = z.object({
  planId: z.enum(['bronze', 'silver', 'golden', 'start', 'growth', 'scale']),
  modules: z.array(z.string()).default([]),
});

export function generateStoreAccessToken(cnpj: string, email: string, storeId?: string): string {
  const cleanDoc = (cnpj || '').replace(/\D/g, '') || '00000000000000';
  const docPart = cleanDoc.slice(-6);
  const hashPart = Math.abs(
    (cleanDoc + (email || '')).split('').reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) | 0, 0),
  )
    .toString(36)
    .toUpperCase()
    .padStart(5, '0')
    .slice(-5);
  const prefix = (storeId || 'STR').replace(/[^a-zA-Z0-9]/g, '').slice(-3).toUpperCase();
  const randPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TK-${prefix || 'STR'}-${docPart}-${hashPart}-${randPart}`;
}

const memoryStores = new Map<string, any>([
  [
    'STR-DEMO-01',
    {
      id: 'STR-DEMO-01',
      clientAccountId: 'ACC-MARTHI-DEMO',
      tradeName: 'Loja Demonstração Marthi',
      legalName: 'Marthi Tecnologia e Demonstração LTDA',
      documentType: 'cnpj',
      document: '00.000.000/0001-91',
      stateRegistration: 'ISENTO',
      municipalRegistration: '12345',
      accessToken: 'TK-DEMO-000191-MDEM-01',
      email: 'loja@marthi.com.br',
      phone: '(11) 3000-0000',
      zipCode: '01310-100',
      street: 'Avenida Paulista',
      number: '1000',
      complement: 'Sala Demo',
      district: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
      taxRegime: 'simples_nacional',
      isMatrix: true,
      active: true,
      planId: 'golden',
      modules: ['totem', 'os', 'erp', 'fiscal'],
      discountPercent: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
]);

/**
 * Consulta da conta comercial contratante do cliente logado
 */
storesRouter.get('/api/v1/account', requireAuth, async (req, res, next) => {
  try {
    const clientAccountId = req.clientAccountId!;
    if (pool) {
      const result = await pool.query('SELECT * FROM client_accounts WHERE id = $1', [clientAccountId]);
      if (result.rows.length > 0) {
        const r = result.rows[0];
        res.json({
          success: true,
          data: {
            id: r.id,
            legalName: r.legal_name || r.trade_name || 'Minha Empresa',
            tradeName: r.trade_name || r.legal_name || 'Minha Empresa',
            document: r.document || '',
            email: r.email || req.user?.email || '',
            phone: r.phone || '',
            accessToken: r.access_token || generateStoreAccessToken(r.document || '00000000000', r.email || '', r.id),
            createdAt: r.created_at,
            updatedAt: r.updated_at,
          },
        });
        return;
      }
    }

    res.json({
      success: true,
      data: {
        id: clientAccountId || 'ACC-MARTHI-DEMO',
        legalName: req.user?.name ? `${req.user.name} LTDA` : 'Minha Empresa LTDA',
        tradeName: req.user?.name || 'Minha Empresa',
        document: '00.000.000/0001-91',
        email: req.user?.email || '',
        phone: '',
        accessToken: generateStoreAccessToken('00000000000', req.user?.email || '', clientAccountId || 'ACC-MARTHI-DEMO'),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Listar lojas / filiais vinculadas à conta do cliente
 */
storesRouter.get('/api/v1/stores', requireAuth, async (req, res, next) => {
  try {
    const clientAccountId = req.clientAccountId!;
    const userId = req.user?.id;

    if (pool) {
      // Se o usuário possuir lojas autorizadas específicas em user_stores, filtra por elas
      const userStoreCount = await pool.query(
        `SELECT COUNT(*)::int as total FROM user_stores WHERE user_id = $1`,
        [userId],
      );
      const hasRestrictedStores = (userStoreCount.rows[0]?.total || 0) > 0;

      let sql = `
        SELECT s.*, l.plan_id, l.modules, l.discount_percent, l.final_price
        FROM stores s
        LEFT JOIN store_licenses l ON l.store_id = s.id
        WHERE s.client_account_id = $1 AND s.active = true
      `;
      const params: any[] = [clientAccountId];

if (hasRestrictedStores) {
        sql += ` AND s.id IN (SELECT store_id FROM user_stores WHERE user_id = $2)`;
        params.push(userId);
      }

      sql += ` ORDER BY s.is_matrix DESC, s.created_at ASC`;
      const result = await pool.query(sql, params);

      res.json({
        success: true,
        data: result.rows.map((r) => ({
          id: r.id,
          clientAccountId: r.client_account_id,
          tradeName: r.trade_name,
          legalName: r.legal_name,
          documentType: r.document_type,
          document: r.document,
          stateRegistration: r.state_registration || '',
          municipalRegistration: r.municipal_registration || '',
          email: r.email,
          phone: r.phone,
          accessToken: r.access_token || generateStoreAccessToken(r.document, r.email, r.id),
          zipCode: r.zip_code,
          street: r.street,
          number: r.number,
          complement: r.complement || '',
          district: r.district,
          city: r.city,
          state: r.state,
          taxRegime: r.tax_regime,
          isMatrix: Boolean(r.is_matrix),
          active: Boolean(r.active),
          planId: r.plan_id || 'golden',
          modules: r.modules || ['totem', 'os', 'erp', 'fiscal'],
          discountPercent: Number(r.discount_percent) || 0,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })),
      });
      return;
    }

    const items = Array.from(memoryStores.values()).filter(
      (s) => s.clientAccountId === clientAccountId && s.active !== false,
    ).map((s) => ({
      ...s,
      accessToken: s.accessToken || generateStoreAccessToken(s.document, s.email, s.id),
    }));
    res.json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
});

/**
 * Cadastrar nova filial vinculada ao CNPJ
 */
storesRouter.post('/api/v1/stores', requireAuth, async (req, res, next) => {
  try {
    const clientAccountId = req.clientAccountId!;
    const body = storeSchema.parse(req.body);
    const id = body.id || `STR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Conta lojas existentes para desconto automático se não for fornecido
        const countRes = await client.query(
          `SELECT COUNT(*)::int as total FROM stores WHERE client_account_id = $1 AND active = true`,
          [clientAccountId],
        );
        const storeCount = (countRes.rows[0]?.total || 0) + 1;

        let discount = body.discountPercent ?? 0;
        if (discount === 0 && storeCount >= 2) {
          // Busca regra progressiva de desconto multi-loja
          const ruleRes = await client.query(
            `SELECT discount_percent FROM licensing_discount_rules
             WHERE active = true AND min_stores <= $1 AND (max_stores IS NULL OR max_stores >= $1)
             ORDER BY discount_percent DESC LIMIT 1`,
            [storeCount],
          );
          if (ruleRes.rows.length > 0) {
            discount = Number(ruleRes.rows[0].discount_percent) || 0;
          }
        }

        await client.query(
          `INSERT INTO stores (
            id, client_account_id, trade_name, legal_name, document_type, document,
            state_registration, municipal_registration, email, phone, zip_code, street,
            number, complement, district, city, state, tax_regime, is_matrix, active
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
          ON CONFLICT (client_account_id, document) DO UPDATE
          SET trade_name = EXCLUDED.trade_name, active = true, updated_at = now()`,
          [
            id,
            clientAccountId,
            body.tradeName.trim(),
            (body.legalName || body.tradeName).trim(),
            body.documentType,
            body.document.trim(),
            body.stateRegistration.trim(),
            body.municipalRegistration.trim(),
            body.email.trim(),
            body.phone.trim(),
            body.zipCode.trim(),
            body.street.trim(),
            body.number.trim(),
            body.complement.trim(),
            body.district.trim(),
            body.city.trim(),
            body.state.trim().toUpperCase(),
            body.taxRegime,
            body.isMatrix,
            body.active,
          ],
        );

        // Cria licença da filial com o desconto
        const licId = `LIC-${id}`;
        await client.query(
          `INSERT INTO store_licenses (
            id, store_id, client_account_id, plan_id, modules, base_price, discount_percent, status
          ) VALUES ($1, $2, $3, 'scale', ARRAY['totem', 'os', 'erp', 'fiscal']::module_id[], 597.00, $4, 'active')
          ON CONFLICT (store_id) DO UPDATE SET discount_percent = $4, status = 'active'`,
          [licId, id, clientAccountId, discount],
        );

        await client.query('COMMIT');

        const createdRes = await pool.query(`SELECT * FROM stores WHERE id = $1`, [id]);
        res.status(201).json({
          success: true,
          data: {
            ...createdRes.rows[0],
            discountPercent: discount,
          },
        });
        return;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    const record = { id, clientAccountId, ...body, createdAt: new Date().toISOString() };
    memoryStores.set(id, record);
    res.status(201).json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
});

/**
 * Atualizar filial / loja
 */
storesRouter.patch('/api/v1/stores/:id', requireAuth, async (req, res, next) => {
  try {
    const clientAccountId = req.clientAccountId!;
    const id = req.params.id;
    const body = storeSchema.partial().parse(req.body);

    if (pool) {
      await pool.query(
        `UPDATE stores
         SET trade_name = COALESCE($1, trade_name),
             legal_name = COALESCE($2, legal_name),
             document = COALESCE($3, document),
             state_registration = COALESCE($4, state_registration),
             municipal_registration = COALESCE($5, municipal_registration),
             email = COALESCE($6, email),
             phone = COALESCE($7, phone),
             zip_code = COALESCE($8, zip_code),
             street = COALESCE($9, street),
             number = COALESCE($10, number),
             district = COALESCE($11, district),
             city = COALESCE($12, city),
             state = COALESCE($13, state),
             is_matrix = COALESCE($14, is_matrix),
             active = COALESCE($15, active),
             updated_at = now()
         WHERE id = $16 AND client_account_id = $17`,
        [
          body.tradeName,
          body.legalName,
          body.document,
          body.stateRegistration,
          body.municipalRegistration,
          body.email,
          body.phone,
          body.zipCode,
          body.street,
          body.number,
          body.district,
          body.city,
          body.state,
          body.isMatrix,
          body.active,
          id,
          clientAccountId,
        ],
      );

      if (body.discountPercent !== undefined) {
        await pool.query(
          `UPDATE store_licenses SET discount_percent = $1 WHERE store_id = $2`,
          [body.discountPercent, id],
        );
      }

      const updated = await pool.query(`SELECT * FROM stores WHERE id = $1 AND client_account_id = $2`, [id, clientAccountId]);
      res.json({ success: true, data: updated.rows[0] });
      return;
    }

    const curr = memoryStores.get(id);
    if (!curr || curr.clientAccountId !== clientAccountId) {
      res.status(404).json({ success: false, error: { message: 'Loja/Filial não encontrada.' } });
      return;
    }
    const updated = { ...curr, ...body, updatedAt: new Date().toISOString() };
    memoryStores.set(id, updated);
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

/**
 * Desativar / Excluir filial
 */
storesRouter.delete('/api/v1/stores/:id', requireAuth, async (req, res, next) => {
  try {
    const clientAccountId = req.clientAccountId!;
    const id = req.params.id;

    if (pool) {
      const chk = await pool.query('SELECT is_matrix FROM stores WHERE id = $1 AND client_account_id = $2', [id, clientAccountId]);
      if (chk.rows.length === 0) {
        res.status(404).json({ success: false, error: { message: 'Loja não encontrada.' } });
        return;
      }
      if (chk.rows[0].is_matrix) {
        const total = await pool.query('SELECT COUNT(*)::int as count FROM stores WHERE client_account_id = $1 AND active = true', [clientAccountId]);
        if ((total.rows[0]?.count || 0) > 1) {
          res.status(400).json({ success: false, error: { message: 'A Loja Matriz não pode ser excluída enquanto houver filiais ativas.' } });
          return;
        }
      }
      await pool.query('UPDATE stores SET active = false, updated_at = now() WHERE id = $1 AND client_account_id = $2', [id, clientAccountId]);
      res.json({ success: true, data: { ok: true } });
      return;
    }

    const curr = memoryStores.get(id);
    if (!curr || curr.clientAccountId !== clientAccountId) {
      res.status(404).json({ success: false, error: { message: 'Loja não encontrada.' } });
      return;
    }
    curr.active = false;
    memoryStores.set(id, curr);
    res.json({ success: true, data: { ok: true } });
  } catch (error) {
    next(error);
  }
});

/**
 * Consulta e alteração do plano e limites da loja (/store/plan)
 */
storesRouter.get('/api/v1/store/plan', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const planId = req.planId || 'golden';
    const limit = req.userLimit || getPlanUserLimit(planId);

    let activeUsers = 0;
    if (pool) {
      const uRes = await pool.query(`SELECT COUNT(*)::int as total FROM employees WHERE store_id = $1 AND active = true`, [storeId]);
      activeUsers = uRes.rows[0]?.total || 0;
    }

    res.json({
      success: true,
      data: {
        planId,
        userLimit: limit,
        activeUsers,
        modules: ['totem', 'os', 'erp', 'fiscal'],
      },
    });
  } catch (error) {
    next(error);
  }
});

storesRouter.put('/api/v1/store/plan', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const clientAccountId = req.clientAccountId!;
    const body = storePlanSchema.parse(req.body);

    let dbPlan = 'scale';
    if (body.planId === 'bronze' || body.planId === 'start') dbPlan = 'start';
    else if (body.planId === 'silver' || body.planId === 'growth') dbPlan = 'growth';

    if (pool) {
      await pool.query(
        `INSERT INTO store_licenses (id, store_id, client_account_id, plan_id, modules, status)
         VALUES ($1, $2, $3, $4::plan_id, $5::module_id[], 'active')
         ON CONFLICT (store_id) DO UPDATE
         SET plan_id = $4::plan_id, modules = $5::module_id[], updated_at = now()`,
        [`LIC-${storeId}`, storeId, clientAccountId, dbPlan, ['totem', 'os', 'erp', 'fiscal']],
      );
    }

    const limit = getPlanUserLimit(body.planId);
    res.json({
      success: true,
      data: {
        planId: body.planId,
        userLimit: limit,
        modules: body.modules,
      },
    });
  } catch (error) {
    next(error);
  }
});

/* ── Admin Gestão de Clientes & Tokens de Acesso (/admin/clientes) ── */

const adminClientSchema = z.object({
  clientId: z.string().optional(),
  tradeName: z.string().min(1, 'Nome fantasia é obrigatório.'),
  legalName: z.string().optional().default(''),
  document: z.string().default(''),
  email: z.string().email('E-mail inválido.'),
  phone: z.string().optional().default(''),
  planId: z.enum(['bronze', 'silver', 'golden', 'start', 'growth', 'scale']).default('golden'),
  modules: z.array(z.string()).default(['totem', 'os', 'erp', 'fiscal', 'ecommerce']),
  status: z.enum(['active', 'blocked', 'inactive']).default('active'),
  paymentOk: z.boolean().default(true),
  monthlyAmount: z.coerce.number().default(597),
  notes: z.string().optional().default(''),
  accessToken: z.string().optional(),
  parentClientId: z.string().optional().nullable(),
  branchName: z.string().optional(),
});

storesRouter.get('/api/v1/admin/clients', async (_req, res, next) => {
  try {
    if (pool) {
      // 1. Busca contas de clientes existentes cruzadas com partner_signups para dados reais de pagamento/ativação
      const sql = `
        SELECT c.*, 
               s.id as store_id, s.trade_name as store_name, s.is_matrix, s.access_token as store_token,
               l.plan_id, l.modules,
               ps.status as partner_status, ps.payment_confirmed_at, ps.payment_method as partner_pay_method,
               ps.transaction_ref as partner_tx_ref, ps.notes as partner_notes, ps.monthly_amount as partner_amount
        FROM client_accounts c
        LEFT JOIN stores s ON s.client_account_id = c.id
        LEFT JOIN store_licenses l ON l.client_account_id = c.id
        LEFT JOIN partner_signups ps ON (ps.id = c.id OR (ps.document = c.document AND ps.document != ''))
        ORDER BY c.created_at ASC
      `;
      const result = await pool.query(sql);
      const map = new Map<string, any>();

      for (const row of result.rows) {
        if (!map.has(row.id)) {
          const rawDoc = row.document || '';
          const token = row.access_token || row.store_token || generateStoreAccessToken(rawDoc, row.email, row.id);
          const isDemo = row.id === 'ACC-MARTHI-DEMO';

          const isPaymentOk =
            isDemo ||
            Boolean(row.payment_confirmed_at) ||
            ['pagamento_aprovado', 'acesso_ativado', 'acesso_pendente', 'cliente_criado'].includes(row.partner_status) ||
            (row.status === 'active' && !row.partner_status);
          let contractingStatus = isDemo ? 'acesso_ativado' : (row.partner_status || 'aguardando_pagamento');
          if (!isPaymentOk) {
            contractingStatus = 'aguardando_pagamento';
          }

          map.set(row.id, {
            clientId: row.id,
            tradeName: row.trade_name,
            legalName: row.legal_name || row.trade_name,
            document: rawDoc,
            email: row.email,
            phone: row.phone || '',
            planId: row.plan_id || 'golden',
            modules: row.modules || ['totem', 'os', 'erp', 'fiscal', 'ecommerce'],
            status: row.status || 'active',
            contractingStatus,
            paymentOk: isPaymentOk,
            monthlyAmount: row.partner_amount ? Number(row.partner_amount) : (row.plan_id === 'bronze' ? 197 : row.plan_id === 'silver' ? 497 : 597),
            contractedAt: row.created_at,
            passwordConfigured: isDemo || contractingStatus === 'acesso_ativado',
            phoneVerified: isDemo,
            notes: row.partner_notes || '',
            accessToken: token,
            paymentDetails: row.partner_pay_method ? {
              method: row.partner_pay_method,
              identifiedAt: row.payment_confirmed_at || row.created_at,
              transactionRef: row.partner_tx_ref || undefined,
            } : undefined,
          });
        }
      }

      // 2. Busca também cadastros em partner_signups pendentes que ainda não estejam em client_accounts
      try {
        const signupsSql = `
          SELECT ps.*
          FROM partner_signups ps
          WHERE NOT EXISTS (
            SELECT 1 FROM client_accounts c WHERE c.id = ps.id OR (c.document = ps.document AND ps.document != '')
          )
          ORDER BY ps.created_at DESC
        `;
        const signupsRes = await pool.query(signupsSql);
        for (const row of signupsRes.rows) {
          if (!map.has(row.id)) {
            const rawDoc = row.document || '';
            const token = generateStoreAccessToken(rawDoc, row.email, row.id);
            const isPaymentOk =
              Boolean(row.payment_confirmed_at) ||
              ['pagamento_aprovado', 'acesso_ativado', 'acesso_pendente', 'cliente_criado'].includes(row.status);
            const contractingStatus = isPaymentOk ? (row.status || 'acesso_pendente') : 'aguardando_pagamento';

            map.set(row.id, {
              clientId: row.id,
              tradeName: row.trade_name,
              legalName: row.legal_name || row.trade_name,
              document: rawDoc,
              email: row.email,
              phone: row.phone || '',
              planId: row.plan_id || 'golden',
              modules: typeof row.modules === 'string' ? JSON.parse(row.modules) : row.modules || ['totem', 'os', 'erp', 'fiscal', 'ecommerce'],
              status: 'active',
              contractingStatus,
              paymentOk: isPaymentOk,
              monthlyAmount: Number(row.monthly_amount) || (row.plan_id === 'bronze' ? 197 : row.plan_id === 'silver' ? 497 : 597),
              contractedAt: row.created_at,
              passwordConfigured: false,
              phoneVerified: false,
              notes: row.notes || '',
              accessToken: token,
              paymentDetails: row.payment_method ? {
                method: row.payment_method,
                identifiedAt: row.payment_confirmed_at || row.created_at,
                transactionRef: row.transaction_ref || undefined,
              } : undefined,
            });
          }
        }
      } catch (signupsErr) {
        console.warn('[storesRouter] Aviso ao buscar signups adicionais:', signupsErr);
      }

      res.json({ success: true, data: Array.from(map.values()) });
      return;
    }

    res.json({ success: true, data: [] });
  } catch (error) {
    console.warn('[storesRouter] Falha ao consultar client_accounts no DB, retornando contingência:', error);
    res.json({
      success: true,
      data: [
        {
          clientId: 'ACC-MARTHI-DEMO',
          tradeName: 'Loja Demonstração Marthi',
          legalName: 'Marthi Tecnologia e Demonstração LTDA',
          document: '00.000.000/0001-91',
          email: 'contato@marthi.com.br',
          phone: '(11) 3000-0000',
          planId: 'golden',
          modules: ['totem', 'os', 'erp', 'fiscal', 'ecommerce'],
          status: 'active',
          contractingStatus: 'acesso_ativado',
          paymentOk: true,
          monthlyAmount: 597,
          contractedAt: new Date().toISOString(),
          passwordConfigured: true,
          phoneVerified: true,
          accessToken: 'TK-DEMO-000191-MDEM-01',
        },
      ],
    });
  }
});

storesRouter.post('/api/v1/admin/clients', async (req, res, next) => {
  try {
    const body = adminClientSchema.parse(req.body);
    const clientId = body.clientId || `CLI-${Date.now().toString(36).toUpperCase()}`;
    const cleanDoc = body.document.trim();
    const token = body.accessToken || generateStoreAccessToken(cleanDoc, body.email, clientId);

    if (pool) {
      // 1. client_accounts
      await pool.query(
        `INSERT INTO client_accounts (id, trade_name, legal_name, document_type, document, email, phone, contact_name, status, access_token)
         VALUES ($1, $2, $3, 'cnpj', $4, $5, $6, $2, $7, $8)
         ON CONFLICT (document) DO UPDATE SET
           trade_name = EXCLUDED.trade_name,
           legal_name = EXCLUDED.legal_name,
           email = EXCLUDED.email,
           phone = EXCLUDED.phone,
           status = EXCLUDED.status,
           access_token = EXCLUDED.access_token,
           updated_at = now()`,
        [clientId, body.tradeName, body.legalName || body.tradeName, cleanDoc, body.email, body.phone, body.status, token],
      );

      // 2. stores
      const storeId = `STR-${clientId.replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase()}`;
      await pool.query(
        `INSERT INTO stores (
           id, client_account_id, trade_name, legal_name, document_type, document,
           email, phone, zip_code, street, number, complement, district, city, state,
           tax_regime, is_matrix, active, access_token
         ) VALUES (
           $1, $2, $3, $4, 'cnpj', $5, $6, $7,
           '25800-000', 'Endereço Comercial', '100', '', 'Centro', 'Três Rios', 'RJ',
           'simples_nacional', true, true, $8
         )
         ON CONFLICT (id) DO UPDATE SET
           trade_name = EXCLUDED.trade_name,
           email = EXCLUDED.email,
           phone = EXCLUDED.phone,
           access_token = EXCLUDED.access_token,
           active = true`,
        [storeId, clientId, body.tradeName, body.legalName || body.tradeName, cleanDoc, body.email, body.phone, token],
      );

      // 3. store_licenses
      let dbPlan = 'scale';
      if (body.planId === 'bronze' || body.planId === 'start') dbPlan = 'start';
      else if (body.planId === 'silver' || body.planId === 'growth') dbPlan = 'growth';

      await pool.query(
        `INSERT INTO store_licenses (id, store_id, client_account_id, plan_id, modules, status)
         VALUES ($1, $2, $3, $4, $5::TEXT[], 'active')
         ON CONFLICT (store_id) DO UPDATE
         SET plan_id = $4, modules = $5::TEXT[], updated_at = now()`,
        [`LIC-${storeId}`, storeId, clientId, dbPlan, ['totem', 'os', 'erp', 'fiscal']],
      );

      // 4. employees
      await pool.query(
        `INSERT INTO employees (id, store_id, name, phone, email, document, role, is_system_user, user_email, access_areas, active)
         VALUES ($1, $2, $3, $4, $5, $6, 'admin', true, $5, '["painel","totem","pdv","os","erp","fiscal","ecommerce"]'::jsonb, true)
         ON CONFLICT (id) DO UPDATE SET active = true, is_system_user = true, access_areas = '["painel","totem","pdv","os","erp","fiscal","ecommerce"]'::jsonb`,
        [`EMP-${clientId.slice(-6)}`, storeId, body.tradeName, body.phone, body.email, cleanDoc],
      );
    }

    res.status(201).json({
      success: true,
      data: {
        ...body,
        clientId,
        accessToken: token,
      },
    });
  } catch (error) {
    next(error);
  }
});

storesRouter.put('/api/v1/admin/clients/:id', async (req, res, next) => {
  try {
    const clientId = req.params.id;
    const body = adminClientSchema.partial().parse(req.body);

    if (pool && clientId) {
      const cleanDoc = (body.document || '').replace(/\D/g, '');
      await pool.query(
        `UPDATE client_accounts
         SET trade_name = COALESCE($1, trade_name),
             document = COALESCE($2, document),
             email = COALESCE($3, email),
             phone = COALESCE($4, phone),
             status = COALESCE($5, status),
             access_token = COALESCE($6, access_token),
             updated_at = now()
         WHERE id = $7 OR lower(email) = lower($3) OR (length($8) >= 6 AND regexp_replace(document, '\\D', '', 'g') = $8)`,
        [body.tradeName, body.document, body.email, body.phone, body.status, body.accessToken, clientId, cleanDoc],
      );

      if (body.tradeName || body.email || body.phone || body.accessToken || body.status) {
        await pool.query(
          `UPDATE stores
           SET trade_name = COALESCE($1, trade_name),
               email = COALESCE($2, email),
               phone = COALESCE($3, phone),
               access_token = COALESCE($4, access_token),
               active = CASE WHEN $5 = 'blocked' OR $5 = 'inactive' THEN false ELSE true END,
               updated_at = now()
           WHERE client_account_id = $6 OR id = $6`,
          [body.tradeName, body.email, body.phone, body.accessToken, body.status, clientId],
        );
      }

      if (body.paymentOk !== undefined || body.tradeName || body.email) {
        await pool.query(
          `UPDATE partner_signups
           SET trade_name = COALESCE($1, trade_name),
               email = COALESCE($2, email),
               payment_confirmed_at = CASE WHEN $3 = true THEN COALESCE(payment_confirmed_at, now()) ELSE payment_confirmed_at END,
               status = CASE WHEN $3 = true THEN 'acesso_ativado' WHEN $3 = false THEN 'aguardando_pagamento' ELSE status END,
               updated_at = now()
           WHERE id = $4 OR lower(email) = lower($2) OR (length($5) >= 6 AND regexp_replace(document, '\\D', '', 'g') = $5)`,
          [body.tradeName, body.email, body.paymentOk, clientId, cleanDoc],
        );
      }
    }

    res.json({
      success: true,
      data: {
        id: clientId,
        ...body,
      },
    });
  } catch (error) {
    next(error);
  }
});

storesRouter.delete('/api/v1/admin/clients/:id', async (req, res, next) => {
  try {
    const clientId = req.params.id;
    if (pool && clientId) {
      await pool.query('DELETE FROM store_licenses WHERE client_account_id = $1', [clientId]);
      await pool.query('DELETE FROM stores WHERE client_account_id = $1', [clientId]);
      await pool.query('DELETE FROM users WHERE client_account_id = $1', [clientId]);
      await pool.query('DELETE FROM client_accounts WHERE id = $1', [clientId]);
    }
    res.json({ success: true, message: 'Cliente removido com sucesso do banco de dados.' });
  } catch (error) {
    next(error);
  }
});
