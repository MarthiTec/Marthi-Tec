import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { pool } from '../db/pool.js';

export const attributesRouter = Router();

const attributeSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Nome do atributo é obrigatório.'),
  values: z.array(z.string()).default([]),
  priceDeltas: z.record(z.coerce.number()).default({}),
  useOnTotem: z.boolean().default(true),
  filterOnTotem: z.boolean().default(false),
  useOnStock: z.boolean().default(true),
  sort: z.coerce.number().default(0),
  active: z.boolean().default(true),
});

// Memória de apoio para isolamento local quando sem DB externo
const memoryAttrs = new Map<string, any>();

function formatAttrResponse(row: any, valueRows: any[]) {
  const values: string[] = [];
  const priceDeltas: Record<string, number> = {};

  for (const v of valueRows) {
    values.push(v.value);
    if (Number(v.price_delta) !== 0) {
      priceDeltas[v.value] = Number(v.price_delta);
    }
  }

  return {
    id: row.id,
    name: row.name,
    values,
    priceDeltas,
    useOnTotem: Boolean(row.use_on_totem),
    filterOnTotem: Boolean(row.filter_on_totem),
    useOnStock: Boolean(row.use_on_stock),
    sort: Number(row.sort) || 0,
    active: Boolean(row.active),
  };
}

/**
 * Listar atributos da loja
 */
attributesRouter.get('/api/v1/attributes', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;

    if (pool) {
      const attrsRes = await pool.query(
        `SELECT id, name, use_on_totem, filter_on_totem, use_on_stock, sort, active
         FROM product_attributes
         WHERE store_id = $1
         ORDER BY sort ASC, name ASC`,
        [storeId],
      );

      const items = [];
      for (const row of attrsRes.rows) {
        const valRes = await pool.query(
          `SELECT value, price_delta, sort FROM product_attribute_values WHERE attribute_id = $1 ORDER BY sort ASC, id ASC`,
          [row.id],
        );
        items.push(formatAttrResponse(row, valRes.rows));
      }

      res.json({ success: true, data: items });
      return;
    }

    // Memory fallback
    const items = Array.from(memoryAttrs.values())
      .filter((a) => a.storeId === storeId)
      .sort((a, b) => a.sort - b.sort);

    res.json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
});

/**
 * Criar novo atributo com opções
 */
attributesRouter.post('/api/v1/attributes', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const body = attributeSchema.parse(req.body);
    const attrId = body.id || `ATTR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        await client.query(
          `INSERT INTO product_attributes (id, store_id, name, use_on_totem, filter_on_totem, use_on_stock, sort, active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            attrId,
            storeId,
            body.name.trim(),
            body.useOnTotem,
            body.filterOnTotem,
            body.useOnStock,
            body.sort,
            body.active,
          ],
        );

        let sortIdx = 0;
        for (const val of body.values) {
          const cleanVal = val.trim();
          if (!cleanVal) continue;
          const delta = body.priceDeltas[cleanVal] || 0;
          const valId = `ATV-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
          await client.query(
            `INSERT INTO product_attribute_values (id, attribute_id, value, price_delta, sort)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (attribute_id, value) DO UPDATE SET price_delta = $4, sort = $5`,
            [valId, attrId, cleanVal, delta, sortIdx++],
          );
        }

        await client.query('COMMIT');

        const created = {
          id: attrId,
          name: body.name.trim(),
          values: body.values.filter(Boolean),
          priceDeltas: body.priceDeltas,
          useOnTotem: body.useOnTotem,
          filterOnTotem: body.filterOnTotem,
          useOnStock: body.useOnStock,
          sort: body.sort,
          active: body.active,
        };

        res.status(201).json({ success: true, data: created });
        return;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    // Memory fallback
    const record = {
      id: attrId,
      storeId,
      ...body,
    };
    memoryAttrs.set(attrId, record);
    res.status(201).json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
});

/**
 * Atualizar atributo
 */
attributesRouter.patch('/api/v1/attributes/:id', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const id = req.params.id;
    const body = attributeSchema.partial().parse(req.body);

    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const existing = await client.query(
          `SELECT id, name, use_on_totem, filter_on_totem, use_on_stock, sort, active
           FROM product_attributes WHERE id = $1 AND store_id = $2`,
          [id, storeId],
        );

        if (existing.rows.length === 0) {
          await client.query('ROLLBACK');
          res.status(404).json({ success: false, error: { message: 'Atributo não encontrado.' } });
          return;
        }

        const current = existing.rows[0];
        const nextName = body.name !== undefined ? body.name.trim() : current.name;
        const nextTotem = body.useOnTotem !== undefined ? body.useOnTotem : current.use_on_totem;
        const nextFilter = body.filterOnTotem !== undefined ? body.filterOnTotem : current.filter_on_totem;
        const nextStock = body.useOnStock !== undefined ? body.useOnStock : current.use_on_stock;
        const nextSort = body.sort !== undefined ? body.sort : current.sort;
        const nextActive = body.active !== undefined ? body.active : current.active;

        await client.query(
          `UPDATE product_attributes
           SET name = $1, use_on_totem = $2, filter_on_totem = $3, use_on_stock = $4, sort = $5, active = $6
           WHERE id = $7 AND store_id = $8`,
          [nextName, nextTotem, nextFilter, nextStock, nextSort, nextActive, id, storeId],
        );

        if (body.values !== undefined) {
          await client.query(`DELETE FROM product_attribute_values WHERE attribute_id = $1`, [id]);
          let sortIdx = 0;
          for (const val of body.values) {
            const cleanVal = val.trim();
            if (!cleanVal) continue;
            const delta = (body.priceDeltas && body.priceDeltas[cleanVal]) || 0;
            const valId = `ATV-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
            await client.query(
              `INSERT INTO product_attribute_values (id, attribute_id, value, price_delta, sort)
               VALUES ($1, $2, $3, $4, $5)`,
              [valId, id, cleanVal, delta, sortIdx++],
            );
          }
        }

        await client.query('COMMIT');

        // Busca atualizado
        const updatedValRes = await pool.query(
          `SELECT value, price_delta, sort FROM product_attribute_values WHERE attribute_id = $1 ORDER BY sort ASC`,
          [id],
        );

        const updated = formatAttrResponse(
          { id, name: nextName, use_on_totem: nextTotem, filter_on_totem: nextFilter, use_on_stock: nextStock, sort: nextSort, active: nextActive },
          updatedValRes.rows,
        );

        res.json({ success: true, data: updated });
        return;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    const current = memoryAttrs.get(id);
    if (!current || current.storeId !== storeId) {
      res.status(404).json({ success: false, error: { message: 'Atributo não encontrado.' } });
      return;
    }
    const updated = { ...current, ...body };
    memoryAttrs.set(id, updated);
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

/**
 * Excluir atributo
 */
attributesRouter.delete('/api/v1/attributes/:id', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const id = req.params.id;

    if (pool) {
      await pool.query(`DELETE FROM product_attributes WHERE id = $1 AND store_id = $2`, [id, storeId]);
      res.json({ success: true, data: { ok: true } });
      return;
    }

    memoryAttrs.delete(id);
    res.json({ success: true, data: { ok: true } });
  } catch (error) {
    next(error);
  }
});
