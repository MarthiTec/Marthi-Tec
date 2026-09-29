import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { pool } from '../db/pool.js';

export const profileRouter = Router();

const profileSchema = z.object({
  displayName: z.string().optional(),
  role: z.string().optional(),
  photo: z.string().nullable().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  theme: z.enum(['light', 'dark']).optional(),
});

const priceTableSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Nome da tabela é obrigatório.'),
  percent: z.coerce.number().default(0),
  active: z.boolean().default(true),
});

const paymentMethodSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Nome da forma de pagamento é obrigatório.'),
  type: z.enum(['cash', 'pix', 'debit', 'credit', 'voucher', 'other']).default('cash'),
  priceTableId: z.string().optional(),
  maxInstallments: z.coerce.number().min(1).default(1),
  active: z.boolean().default(true),
});

/* ── 1. Perfil do Operador (/me/profile) ─────────────────── */

profileRouter.get('/api/v1/me/profile', requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    res.json({
      success: true,
      data: {
        id: user.id,
        displayName: user.name,
        email: user.email,
        role: user.role || 'admin',
        photo: user.picture,
        theme: 'dark',
      },
    });
  } catch (error) {
    next(error);
  }
});

profileRouter.put('/api/v1/me/profile', requireAuth, async (req, res, next) => {
  try {
    const user = req.user!;
    const body = profileSchema.parse(req.body);

    if (pool && user.id.startsWith('usr-')) {
      await pool.query(
        `UPDATE users
         SET name = COALESCE($1, name), picture = COALESCE($2, picture)
         WHERE id = $3`,
        [body.displayName, body.photo, user.id],
      );
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        displayName: body.displayName || user.name,
        email: body.email || user.email,
        role: body.role || user.role || 'admin',
        photo: body.photo !== undefined ? body.photo : user.picture,
        phone: body.phone,
        address: body.address,
        theme: body.theme || 'dark',
      },
    });
  } catch (error) {
    next(error);
  }
});

/* ── 2. Tabelas de Preço (/price-tables) ─────────────────── */

profileRouter.get('/api/v1/price-tables', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    if (pool) {
      const resQuery = await pool.query(
        `SELECT id, name, percent, active, created_at FROM price_tables WHERE store_id = $1 ORDER BY name ASC`,
        [storeId],
      );
      res.json({
        success: true,
        data: resQuery.rows.map((r) => ({
          id: r.id,
          name: r.name,
          percent: Number(r.percent) || 0,
          active: Boolean(r.active),
          createdAt: r.created_at,
        })),
      });
      return;
    }
    res.json({ success: true, data: [] });
  } catch (error) {
    next(error);
  }
});

profileRouter.post('/api/v1/price-tables', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const body = priceTableSchema.parse(req.body);
    const id = body.id || `TAB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    if (pool) {
      await pool.query(
        `INSERT INTO price_tables (id, store_id, name, percent, active) VALUES ($1, $2, $3, $4, $5)`,
        [id, storeId, body.name.trim(), body.percent, body.active],
      );
      const resQuery = await pool.query(`SELECT * FROM price_tables WHERE id = $1`, [id]);
      res.status(201).json({ success: true, data: resQuery.rows[0] });
      return;
    }
    res.status(201).json({ success: true, data: { id, storeId, ...body } });
  } catch (error) {
    next(error);
  }
});

profileRouter.patch('/api/v1/price-tables/:id', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const id = req.params.id;
    const body = priceTableSchema.partial().parse(req.body);

    if (pool) {
      await pool.query(
        `UPDATE price_tables
         SET name = COALESCE($1, name), percent = COALESCE($2, percent), active = COALESCE($3, active)
         WHERE id = $4 AND store_id = $5`,
        [body.name, body.percent, body.active, id, storeId],
      );
      const updated = await pool.query(`SELECT * FROM price_tables WHERE id = $1`, [id]);
      res.json({ success: true, data: updated.rows[0] });
      return;
    }
    res.json({ success: true, data: { id, ...body } });
  } catch (error) {
    next(error);
  }
});

profileRouter.delete('/api/v1/price-tables/:id', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const id = req.params.id;
    if (pool) {
      await pool.query(`DELETE FROM price_tables WHERE id = $1 AND store_id = $2`, [id, storeId]);
    }
    res.json({ success: true, data: { ok: true } });
  } catch (error) {
    next(error);
  }
});

/* ── 3. Formas de Pagamento (/payments) ──────────────────── */

profileRouter.get('/api/v1/payments', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    if (pool) {
      const resQuery = await pool.query(
        `SELECT id, name, type, price_table_id, max_installments, active, created_at FROM payment_methods WHERE store_id = $1 ORDER BY name ASC`,
        [storeId],
      );
      res.json({
        success: true,
        data: resQuery.rows.map((r) => ({
          id: r.id,
          name: r.name,
          type: r.type,
          priceTableId: r.price_table_id,
          maxInstallments: Number(r.max_installments) || 1,
          active: Boolean(r.active),
          createdAt: r.created_at,
        })),
      });
      return;
    }
    res.json({ success: true, data: [] });
  } catch (error) {
    next(error);
  }
});

profileRouter.post('/api/v1/payments', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const body = paymentMethodSchema.parse(req.body);
    const id = body.id || `PAY-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    if (pool) {
      // Garante uma tabela de preço default se não especificada
      let pTableId = body.priceTableId;
      if (!pTableId) {
        const pt = await pool.query(`SELECT id FROM price_tables WHERE store_id = $1 LIMIT 1`, [storeId]);
        if (pt.rows.length > 0) pTableId = pt.rows[0].id;
        else {
          pTableId = `TAB-${Date.now().toString(36)}`;
          await pool.query(`INSERT INTO price_tables (id, store_id, name, percent) VALUES ($1, $2, 'Padrão', 0)`, [pTableId, storeId]);
        }
      }

      await pool.query(
        `INSERT INTO payment_methods (id, store_id, name, type, price_table_id, max_installments, active)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, storeId, body.name.trim(), body.type, pTableId, body.maxInstallments, body.active],
      );
      const resQuery = await pool.query(`SELECT * FROM payment_methods WHERE id = $1`, [id]);
      res.status(201).json({ success: true, data: resQuery.rows[0] });
      return;
    }
    res.status(201).json({ success: true, data: { id, storeId, ...body } });
  } catch (error) {
    next(error);
  }
});

profileRouter.patch('/api/v1/payments/:id', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const id = req.params.id;
    const body = paymentMethodSchema.partial().parse(req.body);

    if (pool) {
      await pool.query(
        `UPDATE payment_methods
         SET name = COALESCE($1, name), type = COALESCE($2, type), max_installments = COALESCE($3, max_installments), active = COALESCE($4, active)
         WHERE id = $5 AND store_id = $6`,
        [body.name, body.type, body.maxInstallments, body.active, id, storeId],
      );
      const updated = await pool.query(`SELECT * FROM payment_methods WHERE id = $1`, [id]);
      res.json({ success: true, data: updated.rows[0] });
      return;
    }
    res.json({ success: true, data: { id, ...body } });
  } catch (error) {
    next(error);
  }
});

profileRouter.delete('/api/v1/payments/:id', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const id = req.params.id;
    if (pool) {
      await pool.query(`DELETE FROM payment_methods WHERE id = $1 AND store_id = $2`, [id, storeId]);
    }
    res.json({ success: true, data: { ok: true } });
  } catch (error) {
    next(error);
  }
});
