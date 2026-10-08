import {rowToClient} from '../services/rowMapper.js';
import { personDetailsFromRow, personDetailsSchema, savePersonDetails } from '../services/personDetails.js';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { pool } from '../db/pool.js';
import { hashPassword, upsertClientUserInMemory } from '../services/authService.js';
import { randomBytes } from 'node:crypto';

export const registryRouter = Router();
registryRouter.use((req,res,next)=>{
 if(!pool) { res.status(503).json({success:false,error:{code:'DATABASE_UNAVAILABLE',message:'Banco indisponível. Nenhum cadastro foi gravado.'}});return; }
 next();
});

/* ── Schemas ───────────────────────────────────────────── */

const employeeSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Nome do colaborador é obrigatório.'),
  phone: z.string().default(''),
  email: z.string().default(''),
  document: z.string().default(''),
  role: z.enum(['admin', 'manager', 'operator', 'seller']).default('operator'),
  isSystemUser: z.boolean().default(false),
  userEmail: z.string().default(''),
  accessPassword: z.string().optional(),
  accessAreas: z.array(z.string()).default([]),
  permissions: z.record(z.any()).default({}),
  active: z.boolean().default(true),
  sellerId: z.string().optional(),
});

const customerSchema = z.object({
  id: z.string().optional(),
  active: z.boolean().default(true),
  neighborhood: z.string().optional(),
  name: z.string().min(1, 'Nome do cliente é obrigatório.'),
  tradeName: z.string().default(''),
  documentType: z.enum(['cnpj', 'cpf']).default('cpf'),
  document: z.string().default(''),
  phone: z.string().default(''),
  email: z.string().default(''),
  zipCode: z.string().default(''),
  street: z.string().default(''),
  number: z.string().default(''),
  complement: z.string().default(''),
  district: z.string().default(''),
  city: z.string().default(''),
  state: z.string().default(''),
  customerGroup: z.string().default('Padrão'),
  creditLimit: z.coerce.number().default(0),
  notes: z.string().default(''),
});

const supplierSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Nome do fornecedor é obrigatório.'),
  tradeName: z.string().default(''),
  document: z.string().default(''),
  phone: z.string().default(''),
  email: z.string().default(''),
  city: z.string().default(''),
  notes: z.string().default(''),
  active: z.boolean().default(true),
});

const sellerSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Nome do vendedor é obrigatório.'),
  phone: z.string().default(''),
  email: z.string().default(''),
  document: z.string().default(''),
  commissionPercent: z.coerce.number().default(0),
  active: z.boolean().default(true),
  employeeId: z.string().optional(),
});

/* ── In-Memory Fallbacks ────────────────────────────────── */

const memoryEmployees = new Map<string, any>();
const memoryCustomers = new Map<string, any>();
const memorySuppliers = new Map<string, any>();
const memorySellers = new Map<string, any>();

function onlyDigits(v: string) {
  return v.replace(/\D/g, '');
}

/* ── 1. Employees / Usuários com Limites do Plano ───────── */

registryRouter.get('/api/v1/employees', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const clientAccountId = req.clientAccountId!;
    const activeOnly = req.query.active === 'true';

    if (pool) {
      const sql = `
        SELECT id, name, phone, email, document, role, is_system_user, user_email,
               access_areas, permissions, active, seller_id, created_at, updated_at
        FROM employees
        WHERE (store_id = $1 OR store_id IN (SELECT id FROM stores WHERE client_account_id = $2))
        ${activeOnly ? 'AND active = true' : ''}
        ORDER BY name ASC
      `;
      const result = await pool.query(sql, [storeId, clientAccountId]);
      const rows = [...result.rows];


      res.json({
        success: true,
        data: rows.map((r) => ({
          id: r.id,
          name: r.name,
          phone: r.phone || '',
          email: r.email || '',
          document: r.document || '',
          role: r.role,
          isSystemUser: Boolean(r.is_system_user),
          userEmail: r.user_email || '',
          accessAreas: Array.isArray(r.access_areas) ? r.access_areas : [],
          permissions: r.permissions || {},
          active: Boolean(r.active),
          sellerId: r.seller_id || undefined,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })),
      });
      return;
    }

    let items = Array.from(memoryEmployees.values());
    if (clientAccountId !== 'ACC-MARTHI-DEMO' && storeId !== 'STR-DEMO-01') {
      items = items.filter((e) => e.storeId === storeId);
    }
    if (activeOnly) items = items.filter((e) => e.active);
    res.json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
});

registryRouter.post('/api/v1/employees', requireAuth, async (req, res, next) => {
  try {
    if (!['admin', 'superadmin'].includes(req.user!.role || '')) throw Object.assign(new Error('Somente administradores podem alterar usuários.'), {status: 403});
    const storeId = req.storeId!;
    const clientAccountId = req.clientAccountId!;
    const body = employeeSchema.parse(req.body);

    const userLimit = req.userLimit || 10;
    const planName = (req.planId || 'Bronze').toUpperCase();

    // 1. Validação estrita de limite de usuários ativos do plano
    if (body.active) {
      let activeCount = 0;
      if (pool) {
        const countRes = await pool.query(
          `SELECT COUNT(*)::int as total FROM employees WHERE store_id = $1 AND active = true`,
          [storeId],
        );
        activeCount = countRes.rows[0]?.total || 0;
      } else {
        activeCount = Array.from(memoryEmployees.values()).filter((e) => e.storeId === storeId && e.active).length;
      }

      if (activeCount >= userLimit) {
        res.status(400).json({
          success: false,
          error: {
            code: 'PLAN_LIMIT_REACHED',
            message: `Limite de usuários ativos do plano ${planName} (${userLimit} usuários) atingido. Faça upgrade do seu plano para liberar mais acessos.`,
          },
        });
        return;
      }
    }

    const empId = body.id || `EMP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const cleanUserEmail = body.isSystemUser ? (body.userEmail || body.email).trim().toLowerCase() : '';

    if (body.isSystemUser && !cleanUserEmail) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Colaborador marcado como usuário precisa de e-mail de acesso.' },
      });
      return;
    }

    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Se for usuário do sistema, cria credencial na tabela users
        if (body.isSystemUser && cleanUserEmail) {
          const pass = (body.accessPassword || '').trim();
          if (pass.length < 8) throw Object.assign(new Error('Informe uma senha de pelo menos 8 caracteres.'), {status: 400});
          const salt = randomBytes(16).toString('hex');
          const passHash = hashPassword(pass, salt);

          const userId = `usr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
          const savedUser = await client.query(
            `INSERT INTO users (id, client_account_id, email, name, provider, password_hash, global_role, active)
             VALUES ($1, $2, $3, $4, 'password', $5, $6, true)
             ON CONFLICT (email) DO UPDATE
             SET name = EXCLUDED.name
             WHERE users.client_account_id = EXCLUDED.client_account_id AND users.global_role <> 'superadmin'
             RETURNING id`,
            [userId, clientAccountId, cleanUserEmail, body.name.trim(), `${salt}:${passHash}`, body.role],
          );

          if (!savedUser.rows.length) throw Object.assign(new Error('E-mail já vinculado a outro acesso.'), {status: 409});
          await client.query(
            `INSERT INTO user_stores (id, user_id, store_id, role, permissions)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_id, store_id) DO UPDATE SET role = $4, permissions = $5`,
            [`UST-${Date.now().toString(36)}`, savedUser.rows[0].id, storeId, body.role, JSON.stringify(body.permissions)],
          );
        }

        await client.query(
          `INSERT INTO employees (
            id, store_id, name, phone, email, document, role, is_system_user, user_email,
            access_areas, permissions, active, seller_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            empId,
            storeId,
            body.name.trim(),
            body.phone.trim(),
            body.email.trim(),
            body.document.trim(),
            body.role,
            body.isSystemUser,
            cleanUserEmail,
            JSON.stringify(body.accessAreas),
            JSON.stringify(body.permissions),
            body.active,
            body.sellerId || null,
          ],
        );

        await client.query('COMMIT');

        const createdRes = await pool.query(`SELECT * FROM employees WHERE id = $1`, [empId]);
        const r = createdRes.rows[0];
        res.status(201).json({
          success: true,
          data: {
            id: r.id,
            name: r.name,
            phone: r.phone || '',
            email: r.email || '',
            document: r.document || '',
            role: r.role,
            isSystemUser: Boolean(r.is_system_user),
            userEmail: r.user_email || '',
            accessAreas: Array.isArray(r.access_areas) ? r.access_areas : [],
            permissions: r.permissions || {},
            active: Boolean(r.active),
            sellerId: r.seller_id || undefined,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
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

    const record = {
      id: empId,
      storeId,
      ...body,
      userEmail: cleanUserEmail,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    memoryEmployees.set(empId, record);
    if (body.isSystemUser && cleanUserEmail) {
      upsertClientUserInMemory(cleanUserEmail, body.name, body.accessPassword || '123456', body.role, clientAccountId);
    }
    res.status(201).json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
});

registryRouter.patch('/api/v1/employees/:id', requireAuth, async (req, res, next) => {
  try {
    if (!['admin', 'superadmin'].includes(req.user!.role || '')) throw Object.assign(new Error('Somente administradores podem alterar usuários.'), {status: 403});
    const storeId = req.storeId!;
    const clientAccountId = req.clientAccountId!;
    const id = req.params.id;
    const body = employeeSchema.partial().parse(req.body);

    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const currentRes = await client.query(`SELECT * FROM employees WHERE id = $1 AND store_id = $2`, [id, storeId]);
        if (currentRes.rows.length === 0) {
          await client.query('ROLLBACK');
          res.status(404).json({ success: false, error: { message: 'Colaborador não encontrado.' } });
          return;
        }

        const curr = currentRes.rows[0];

        // Se está ativando um colaborador inativo, valida o limite do plano
        if (body.active === true && curr.active === false) {
          const userLimit = req.userLimit || 10;
          const countRes = await client.query(
            `SELECT COUNT(*)::int as total FROM employees WHERE store_id = $1 AND active = true`,
            [storeId],
          );
          if ((countRes.rows[0]?.total || 0) >= userLimit) {
            await client.query('ROLLBACK');
            res.status(400).json({
              success: false,
              error: {
                code: 'PLAN_LIMIT_REACHED',
                message: `Limite de usuários ativos do plano (${userLimit} usuários) atingido.`,
              },
            });
            return;
          }
        }

        const cleanEmail = body.userEmail !== undefined ? body.userEmail.trim().toLowerCase() : curr.user_email;

        // Atualiza senha se informada
        if (body.accessPassword && cleanEmail) {
          if (body.accessPassword.trim().length < 8) throw Object.assign(new Error('Informe uma senha de pelo menos 8 caracteres.'), {status: 400});
          const salt = randomBytes(16).toString('hex');
          const passHash = hashPassword(body.accessPassword.trim(), salt);
          const userId = `usr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
          const savedUser = await client.query(
            `INSERT INTO users (id, client_account_id, email, name, provider, password_hash, global_role, active)
             VALUES ($1, $2, $3, $4, 'password', $5, $6, true)
             ON CONFLICT (email) DO UPDATE
             SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name, session_version = users.session_version + 1
             WHERE users.client_account_id = EXCLUDED.client_account_id AND users.global_role <> 'superadmin'
             AND EXISTS (SELECT 1 FROM user_stores us WHERE us.user_id = users.id AND us.store_id = $7)
             RETURNING id`,
            [
              userId,
              clientAccountId,
              cleanEmail,
              (body.name || curr.name).trim(),
              `${salt}:${passHash}`,
              body.role || curr.role,
              storeId,
            ],
          );
          if (!savedUser.rows.length) throw Object.assign(new Error('E-mail já vinculado a outro acesso.'), {status: 409});
          await client.query(
            `INSERT INTO user_stores (id, user_id, store_id, role, permissions)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_id, store_id) DO UPDATE SET role = $4, permissions = $5`,
            [
              `UST-${Date.now().toString(36)}`,
              savedUser.rows[0].id,
              storeId,
              body.role || curr.role,
              JSON.stringify(body.permissions || curr.permissions || {}),
            ],
          );

        }

        const systemAccess = body.isSystemUser ?? curr.is_system_user;
        const accessActive = body.active ?? curr.active;
        if (systemAccess && accessActive && cleanEmail) {
          const access = await client.query('SELECT u.id FROM users u JOIN user_stores us ON us.user_id = u.id WHERE lower(u.email) = lower($1) AND u.client_account_id = $2 AND us.store_id = $3', [cleanEmail, clientAccountId, storeId]);
          if (!access.rows.length) throw Object.assign(new Error('Usuário de acesso não pertence à loja selecionada.'), {status: 400});
          await client.query('UPDATE user_stores SET role = $1, permissions = $2 WHERE user_id = $3 AND store_id = $4', [body.role || curr.role, JSON.stringify(body.permissions || curr.permissions || {}), access.rows[0].id, storeId]);
        }
        if (!systemAccess || !accessActive || cleanEmail !== curr.user_email) {
          await client.query('DELETE FROM user_stores WHERE store_id = $1 AND user_id IN (SELECT id FROM users WHERE lower(email) = lower($2) AND client_account_id = $3)', [storeId, curr.user_email, clientAccountId]);
        }
        await client.query(
          `UPDATE employees
           SET name = COALESCE($1, name),
               phone = COALESCE($2, phone),
               email = COALESCE($3, email),
               document = COALESCE($4, document),
               role = COALESCE($5, role),
               is_system_user = COALESCE($6, is_system_user),
               user_email = COALESCE($7, user_email),
               access_areas = COALESCE($8, access_areas),
               permissions = COALESCE($9, permissions),
               active = COALESCE($10, active),
               seller_id = COALESCE($11, seller_id),
               updated_at = now()
           WHERE id = $12 AND store_id = $13`,
          [
            body.name,
            body.phone,
            body.email,
            body.document,
            body.role,
            body.isSystemUser,
            cleanEmail,
            body.accessAreas ? JSON.stringify(body.accessAreas) : null,
            body.permissions ? JSON.stringify(body.permissions) : null,
            body.active,
            body.sellerId,
            id,
            storeId,
          ],
        );

        await client.query('COMMIT');

        const updatedRes = await pool.query(`SELECT * FROM employees WHERE id = $1`, [id]);
        const r = updatedRes.rows[0];
        res.json({
          success: true,
          data: {
            id: r.id,
            name: r.name,
            phone: r.phone || '',
            email: r.email || '',
            document: r.document || '',
            role: r.role,
            isSystemUser: Boolean(r.is_system_user),
            userEmail: r.user_email || '',
            accessAreas: Array.isArray(r.access_areas) ? r.access_areas : [],
            permissions: r.permissions || {},
            active: Boolean(r.active),
            sellerId: r.seller_id || undefined,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
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

    const current = memoryEmployees.get(id);
    if (!current || current.storeId !== storeId) {
      res.status(404).json({ success: false, error: { message: 'Colaborador não encontrado.' } });
      return;
    }
    const updated = { ...current, ...body, updatedAt: new Date().toISOString() };
    memoryEmployees.set(id, updated);
    if (body.accessPassword && (body.userEmail || current.userEmail)) {
      const email = (body.userEmail || current.userEmail).trim().toLowerCase();
      upsertClientUserInMemory(email, body.name || current.name, body.accessPassword, body.role || current.role, req.clientAccountId);
    }
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

registryRouter.delete('/api/v1/employees/:id', requireAuth, async (req, res, next) => {
  try {
    if (!['admin', 'superadmin'].includes(req.user!.role || '')) throw Object.assign(new Error('Somente administradores podem alterar usuários.'), {status: 403});
    const storeId = req.storeId!;
    const id = req.params.id;

    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM user_stores WHERE store_id = $1 AND user_id IN (SELECT u.id FROM users u JOIN employees e ON lower(u.email) = lower(e.user_email) WHERE e.id = $2 AND e.store_id = $1 AND u.client_account_id = $3)', [storeId, id, req.clientAccountId]);
        await client.query('DELETE FROM employees WHERE id = $1 AND store_id = $2', [id, storeId]);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
      res.json({ success: true, data: { ok: true } });
      return;
    }

    memoryEmployees.delete(id);
    res.json({ success: true, data: { ok: true } });
  } catch (error) {
    next(error);
  }
});

/* ── 2. Clientes (Customers) ────────────────────────────── */

registryRouter.get('/api/v1/customers', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const q = req.query.q ? String(req.query.q).trim() : '';

    if (pool) {
      const conditions = ['store_id = $1'];
      const values: any[] = [storeId];
      if (q) {
        conditions.push(`(name ILIKE $2 OR document ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2)`);
        values.push(`%${q}%`);
      }
      const sql = `SELECT * FROM customers WHERE ${conditions.join(' AND ')} ORDER BY name ASC`;
      const result = await pool.query(sql, values);
      res.json({
        success: true,
        data: result.rows.map((r) => ({
          ...personDetailsFromRow(r),
          id: r.id,
          name: r.name,
          tradeName: r.trade_name || '',
          documentType: r.document_type,
          document: r.document || '',
          phone: r.phone || '',
          phoneDigits: r.phone_digits || '',
          email: r.email || '',
          zipCode: r.zip_code || '',
          street: r.street || '',
          number: r.number || '',
          complement: r.complement || '',
          district: r.district || '',
          city: r.city || '',
          state: r.state || '',
          active: Boolean(r.active),
          neighborhood: r.district || '',
          customerGroup: r.customer_group || 'Padrão',
          creditLimit: Number(r.credit_limit) || 0,
          notes: r.notes || '',
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })),
      });
      return;
    }

    let items = Array.from(memoryCustomers.values()).filter((c) => c.storeId === storeId);
    if (q) {
      const needle = q.toLowerCase();
      items = items.filter((c) => c.name.toLowerCase().includes(needle) || c.document?.includes(needle));
    }
    res.json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
});

registryRouter.post('/api/v1/customers', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const body = customerSchema.parse(req.body);
    const id = body.id || `CUS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const pDigits = onlyDigits(body.phone);

    if (pool) {
      const inserted = await pool.query(
        `INSERT INTO customers (
          id, store_id, name, trade_name, document_type, document, phone, phone_digits,
          email, zip_code, street, number, complement, district, city, state, customer_group, credit_limit, notes, active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        ON CONFLICT (store_id, phone_digits) DO NOTHING RETURNING *`,
        [
          id,
          storeId,
          body.name.trim(),
          body.tradeName.trim(),
          body.documentType,
          body.document.trim(),
          body.phone.trim(),
          pDigits || null,
          body.email.trim(),
          body.zipCode.trim(),
          body.street.trim(),
          body.number.trim(),
          body.complement.trim(),
          (body.neighborhood ?? body.district).trim(),
          body.city.trim(),
          body.state.trim().toUpperCase(),
          body.customerGroup,
          body.creditLimit,
          body.notes.trim(),
          body.active,
        ],
      );

      if(!inserted.rows[0]) throw Object.assign(new Error('Já existe um cliente com este telefone nesta loja.'),{status:409});
      await savePersonDetails(pool, 'customers', id, storeId, personDetailsSchema.parse(req.body));
      const saved = (await pool.query('SELECT * FROM customers WHERE id = $1 AND store_id = $2', [id, storeId])).rows[0];
      res.status(201).json({success:true,data:{...rowToClient(saved),...personDetailsFromRow(saved)}});
      return;
    }

    const record = { id, storeId, ...body, phoneDigits: pDigits, createdAt: new Date().toISOString() };
    memoryCustomers.set(id, record);
    res.status(201).json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
});

registryRouter.patch('/api/v1/customers/:id', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const id = req.params.id;
    const body = customerSchema.partial().parse(req.body);

    if (pool) {
      await pool.query(
        `UPDATE customers
         SET name = COALESCE($1, name),
             trade_name = COALESCE($2, trade_name),
             document = COALESCE($3, document),
             phone = COALESCE($4, phone),
             email = COALESCE($5, email),
             zip_code = COALESCE($6, zip_code),
             street = COALESCE($7, street),
             number = COALESCE($8, number),
             district = COALESCE($9, district),
             city = COALESCE($10, city),
             state = COALESCE($11, state),
             customer_group = COALESCE($12, customer_group),
             credit_limit = COALESCE($13, credit_limit),
             notes = COALESCE($14, notes),
             complement = COALESCE($17, complement), document_type = COALESCE($18, document_type),
             active = COALESCE($19, active), phone_digits = CASE WHEN $20 THEN $21 ELSE phone_digits END,
             updated_at = now()
         WHERE id = $15 AND store_id = $16`,
        [
          body.name,
          body.tradeName,
          body.document,
          body.phone,
          body.email,
          body.zipCode,
          body.street,
          body.number,
          body.neighborhood ?? body.district,
          body.city,
          body.state,
          body.customerGroup,
          body.creditLimit,
          body.notes,
          id,
          storeId,
          body.complement,body.documentType,body.active,body.phone!==undefined,body.phone===undefined ? null : onlyDigits(body.phone)||null,
        ],
      );
      await savePersonDetails(pool, 'customers', id, storeId, personDetailsSchema.parse(req.body));
      const updated = await pool.query(`SELECT * FROM customers WHERE id = $1 AND store_id=$2`, [id,storeId]);
      res.json({ success: true, data: {...rowToClient(updated.rows[0]),...personDetailsFromRow(updated.rows[0] ?? {})} });
      return;
    }

    const curr = memoryCustomers.get(id);
    if (!curr || curr.storeId !== storeId) {
      res.status(404).json({ success: false, error: { message: 'Cliente não encontrado.' } });
      return;
    }
    const updated = { ...curr, ...body, updatedAt: new Date().toISOString() };
    memoryCustomers.set(id, updated);
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

registryRouter.delete('/api/v1/customers/:id', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const id = req.params.id;
    if (pool) {
      await pool.query(`DELETE FROM customers WHERE id = $1 AND store_id = $2`, [id, storeId]);
      res.json({ success: true, data: { ok: true } });
      return;
    }
    memoryCustomers.delete(id);
    res.json({ success: true, data: { ok: true } });
  } catch (error) {
    next(error);
  }
});

/* ── 3. Fornecedores (Suppliers) ────────────────────────── */

registryRouter.get('/api/v1/suppliers', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    if (pool) {
      const result = await pool.query(`SELECT * FROM suppliers WHERE store_id = $1 ORDER BY name ASC`, [storeId]);
      res.json({ success: true, data: result.rows.map((row) => ({ ...rowToClient(row), ...personDetailsFromRow(row) })) });
      return;
    }
    res.json({ success: true, data: Array.from(memorySuppliers.values()).filter((s) => s.storeId === storeId) });
  } catch (error) {
    next(error);
  }
});

registryRouter.post('/api/v1/suppliers', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const body = supplierSchema.parse(req.body);
    const id = body.id || `SUP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    if (pool) {
      await pool.query(
        `INSERT INTO suppliers (id, store_id, name, trade_name, document, phone, email, city, notes, active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          id,
          storeId,
          body.name.trim(),
          body.tradeName.trim(),
          body.document.trim(),
          body.phone.trim(),
          body.email.trim(),
          body.city.trim(),
          body.notes.trim(),
          body.active,
        ],
      );
      await savePersonDetails(pool, 'suppliers', id, storeId, personDetailsSchema.parse(req.body));
      const resQuery = await pool.query(`SELECT * FROM suppliers WHERE id = $1 AND store_id = $2`, [id, storeId]);
      res.status(201).json({ success: true, data: { ...rowToClient(resQuery.rows[0]), ...personDetailsFromRow(resQuery.rows[0] ?? {}) } });
      return;
    }

    const record = { id, storeId, ...body, createdAt: new Date().toISOString() };
    memorySuppliers.set(id, record);
    res.status(201).json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
});

registryRouter.patch('/api/v1/suppliers/:id', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const id = req.params.id;
    const body = supplierSchema.partial().parse(req.body);

    if (pool) {
      await pool.query(
        `UPDATE suppliers
         SET name = COALESCE($1, name), trade_name = COALESCE($2, trade_name), document = COALESCE($3, document),
             phone = COALESCE($4, phone), email = COALESCE($5, email), city = COALESCE($6, city),
             notes = COALESCE($7, notes), active = COALESCE($8, active), updated_at = now()
         WHERE id = $9 AND store_id = $10`,
        [body.name, body.tradeName, body.document, body.phone, body.email, body.city, body.notes, body.active, id, storeId],
      );
      await savePersonDetails(pool, 'suppliers', id, storeId, personDetailsSchema.parse(req.body));
      const updated = await pool.query(`SELECT * FROM suppliers WHERE id = $1 AND store_id = $2`, [id, storeId]);
      res.json({ success: true, data: { ...rowToClient(updated.rows[0]), ...personDetailsFromRow(updated.rows[0] ?? {}) } });
      return;
    }

    const curr = memorySuppliers.get(id);
    if (!curr || curr.storeId !== storeId) {
      res.status(404).json({ success: false, error: { message: 'Fornecedor não encontrado.' } });
      return;
    }
    const updated = { ...curr, ...body, updatedAt: new Date().toISOString() };
    memorySuppliers.set(id, updated);
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

registryRouter.delete('/api/v1/suppliers/:id', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const id = req.params.id;
    if (pool) {
      await pool.query(`DELETE FROM suppliers WHERE id = $1 AND store_id = $2`, [id, storeId]);
      res.json({ success: true, data: { ok: true } });
      return;
    }
    memorySuppliers.delete(id);
    res.json({ success: true, data: { ok: true } });
  } catch (error) {
    next(error);
  }
});

/* ── 4. Vendedores (Sellers) ────────────────────────────── */

registryRouter.get('/api/v1/sellers', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    if (pool) {
      const result = await pool.query(`SELECT * FROM sellers WHERE store_id = $1 ORDER BY name ASC`, [storeId]);
      res.json({ success: true, data: result.rows.map((row) => ({ ...rowToClient(row), ...personDetailsFromRow(row) })) });
      return;
    }
    res.json({ success: true, data: Array.from(memorySellers.values()).filter((s) => s.storeId === storeId) });
  } catch (error) {
    next(error);
  }
});

registryRouter.post('/api/v1/sellers', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const body = sellerSchema.parse(req.body);
    const id = body.id || `SEL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    if (pool) {
      await pool.query(
        `INSERT INTO sellers (id, store_id, name, phone, email, document, commission_percent, active, employee_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          id,
          storeId,
          body.name.trim(),
          body.phone.trim(),
          body.email.trim(),
          body.document.trim(),
          body.commissionPercent,
          body.active,
          body.employeeId || null,
        ],
      );
      await savePersonDetails(pool, 'sellers', id, storeId, personDetailsSchema.parse(req.body));
      const resQuery = await pool.query(`SELECT * FROM sellers WHERE id = $1 AND store_id = $2`, [id, storeId]);
      res.status(201).json({ success: true, data: { ...rowToClient(resQuery.rows[0]), ...personDetailsFromRow(resQuery.rows[0] ?? {}) } });
      return;
    }

    const record = { id, storeId, ...body, createdAt: new Date().toISOString() };
    memorySellers.set(id, record);
    res.status(201).json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
});

registryRouter.patch('/api/v1/sellers/:id', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const id = req.params.id;
    const body = sellerSchema.partial().parse(req.body);

    if (pool) {
      await pool.query(
        `UPDATE sellers
         SET name = COALESCE($1, name), phone = COALESCE($2, phone), email = COALESCE($3, email),
             document = COALESCE($4, document), commission_percent = COALESCE($5, commission_percent),
             active = COALESCE($6, active), employee_id = COALESCE($7, employee_id), updated_at = now()
         WHERE id = $8 AND store_id = $9`,
        [body.name, body.phone, body.email, body.document, body.commissionPercent, body.active, body.employeeId, id, storeId],
      );
      await savePersonDetails(pool, 'sellers', id, storeId, personDetailsSchema.parse(req.body));
      const updated = await pool.query(`SELECT * FROM sellers WHERE id = $1 AND store_id = $2`, [id, storeId]);
      res.json({ success: true, data: { ...rowToClient(updated.rows[0]), ...personDetailsFromRow(updated.rows[0] ?? {}) } });
      return;
    }

    const curr = memorySellers.get(id);
    if (!curr || curr.storeId !== storeId) {
      res.status(404).json({ success: false, error: { message: 'Vendedor não encontrado.' } });
      return;
    }
    const updated = { ...curr, ...body, updatedAt: new Date().toISOString() };
    memorySellers.set(id, updated);
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

registryRouter.delete('/api/v1/sellers/:id', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const id = req.params.id;
    if (pool) {
      await pool.query(`DELETE FROM sellers WHERE id = $1 AND store_id = $2`, [id, storeId]);
      res.json({ success: true, data: { ok: true } });
      return;
    }
    memorySellers.delete(id);
    res.json({ success: true, data: { ok: true } });
  } catch (error) {
    next(error);
  }
});
