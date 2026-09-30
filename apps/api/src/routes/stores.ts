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
});

const storePlanSchema = z.object({
  planId: z.enum(['bronze', 'silver', 'golden', 'start', 'growth', 'scale']),
  modules: z.array(z.string()).default([]),
});

const memoryStores = new Map<string, any>([
  [
    'STR-DEMO-01',
    {
      id: 'STR-DEMO-01',
      clientAccountId: 'ACC-MARTHI-DEMO',
      tradeName: 'Cell Ponto Matriz',
      legalName: 'Cell Ponto Telecomunicações LTDA',
      documentType: 'cnpj',
      document: '61.506.270/0001-63',
      stateRegistration: 'ISENTO',
      municipalRegistration: '12345',
      email: 'matriz@cellponto.com.br',
      phone: '(24) 98124-4253',
      zipCode: '25800-000',
      street: 'Rua Prefeito Walter Franklin',
      number: '120',
      complement: 'Loja 01',
      district: 'Centro',
      city: 'Três Rios',
      state: 'RJ',
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
            legalName: r.legal_name || 'Cell Ponto Telecomunicações LTDA',
            tradeName: r.trade_name || 'Cell Ponto',
            document: r.document || '61.506.270/0001-63',
            email: r.email || req.user?.email || 'gilvanteodo@gmail.com',
            phone: r.phone || '(24) 98124-4253',
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
        legalName: 'Cell Ponto Telecomunicações LTDA',
        tradeName: 'Cell Ponto',
        document: '61.506.270/0001-63',
        email: req.user?.email || 'gilvanteodo@gmail.com',
        phone: '(24) 98124-4253',
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

      if (hasRestrictedStores && req.user?.role !== 'admin') {
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
    );
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

      const updated = await pool.query(`SELECT * FROM stores WHERE id = $1`, [id]);
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
