import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireOrDemoAuth } from '../middlewares/authMiddleware.js';
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
attributesRouter.get('/api/v1/attributes', requireOrDemoAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId || 'STR-DEMO-01';

    if (pool) {
      try {
        const attrsRes = await pool.query(
          `SELECT id, name, use_on_totem, filter_on_totem, use_on_stock, sort, active
           FROM product_attributes
           WHERE store_id = $1
           ORDER BY sort ASC, name ASC`,
          [storeId],
        );

        if (attrsRes.rows.length > 0) {
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

        // Se a loja não tem atributos no DB, retorna lista vazia (a não ser que seja a loja demo)
        if (storeId !== 'STR-DEMO-01') {
          res.json({ success: true, data: [] });
          return;
        }
      } catch (dbErr) {
        console.warn('[attributes] Falha ao consultar banco, usando fallback:', dbErr);
      }
    }

    // Memory fallback
    let items = Array.from(memoryAttrs.values())
      .filter((a) => a.storeId === storeId)
      .sort((a, b) => a.sort - b.sort);

    if (items.length === 0 && storeId === 'STR-DEMO-01') {
      items = [
        { id: 'ATTR-COR', storeId, name: 'Cor', values: ['Preto', 'Branco', 'Azul', 'Desert', 'Titânio Natural'], active: true, useOnTotem: true, useOnStock: true, filterOnTotem: true, sort: 1, priceDeltas: {} },
        { id: 'ATTR-CAP', storeId, name: 'Capacidade', values: ['64 GB', '128 GB', '256 GB', '512 GB', '1 TB'], active: true, useOnTotem: true, useOnStock: true, filterOnTotem: true, sort: 2, priceDeltas: {} },
      ];
      for (const item of items) memoryAttrs.set(item.id, item);
    }

    res.json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
});

/**
 * Criar novo atributo com opções
 */
attributesRouter.post('/api/v1/attributes', requireOrDemoAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId || 'STR-DEMO-01';
    const body = attributeSchema.parse(req.body);
    const attrId = body.id || `ATTR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

    if (pool) {
      let client: any = null;
      try {
        client = await pool.connect();
      } catch (connErr) {
        console.warn('[attributes] Falha ao conectar ao PostgreSQL no POST, usando memória:', connErr);
      }

      if (client) {
        try {
          await client.query('BEGIN');

          // Garante a loja em stores para não quebrar a FK
          await client.query(
            `INSERT INTO stores (id, client_account_id, trade_name, legal_name, document_type, document, active)
             VALUES ($1, 'ACC-MARTHI-DEMO', 'Cell Ponto Matriz', 'Cell Ponto Telecomunicações LTDA', 'cnpj', '61.506.270/0001-63', true)
             ON CONFLICT (id) DO NOTHING`,
            [storeId],
          );

          await client.query(
            `INSERT INTO product_attributes (id, store_id, name, use_on_totem, filter_on_totem, use_on_stock, sort, active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) DO UPDATE SET
               name = $3, use_on_totem = $4, filter_on_totem = $5, use_on_stock = $6, sort = $7, active = $8`,
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

          await client.query(`DELETE FROM product_attribute_values WHERE attribute_id = $1`, [attrId]);

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
          console.error('[attributes] Erro ao criar atributo no banco:', err);
          throw err;
        } finally {
          client.release();
        }
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
 * Atualizar atributo (PATCH e PUT)
 */
async function handleUpdateAttribute(req: any, res: any, next: any) {
  try {
    const storeId = req.storeId || 'STR-DEMO-01';
    const id = req.params.id;
    const body = attributeSchema.partial().parse(req.body);

    if (pool) {
      let client: any = null;
      try {
        client = await pool.connect();
      } catch (connErr) {
        console.warn('[attributes] Falha ao conectar ao PostgreSQL no UPDATE, usando memória:', connErr);
      }

      if (client) {
        try {
          await client.query('BEGIN');

          // Garante a loja em stores para não quebrar a FK
          const clientAccountId = req.clientAccountId || 'ACC-MARTHI-DEMO';
          await client.query(
            `INSERT INTO stores (id, client_account_id, trade_name, legal_name, document_type, document, active)
             VALUES ($1, $2, 'Minha Loja', 'Minha Empresa LTDA', 'cnpj', '00.000.000/0001-91', true)
             ON CONFLICT (id) DO NOTHING`,
            [storeId, clientAccountId],
          );

          const existing = await client.query(
            `SELECT id, name, use_on_totem, filter_on_totem, use_on_stock, sort, active
             FROM product_attributes
             WHERE (id = $1 OR LOWER(name) = LOWER($3)) AND store_id = $2`,
            [id, storeId, body.name || id],
          );

          let targetId = id;
          let nextName = body.name !== undefined ? body.name.trim() : 'Atributo';
          let nextTotem = body.useOnTotem !== undefined ? body.useOnTotem : true;
          let nextFilter = body.filterOnTotem !== undefined ? body.filterOnTotem : false;
          let nextStock = body.useOnStock !== undefined ? body.useOnStock : true;
          let nextSort = body.sort !== undefined ? body.sort : 0;
          let nextActive = body.active !== undefined ? body.active : true;

          if (existing.rows.length > 0) {
            const current = existing.rows[0];
            targetId = current.id;
            nextName = body.name !== undefined ? body.name.trim() : current.name;
            nextTotem = body.useOnTotem !== undefined ? body.useOnTotem : current.use_on_totem;
            nextFilter = body.filterOnTotem !== undefined ? body.filterOnTotem : current.filter_on_totem;
            nextStock = body.useOnStock !== undefined ? body.useOnStock : current.use_on_stock;
            nextSort = body.sort !== undefined ? body.sort : current.sort;
            nextActive = body.active !== undefined ? body.active : current.active;

            await client.query(
              `UPDATE product_attributes
               SET name = $1, use_on_totem = $2, filter_on_totem = $3, use_on_stock = $4, sort = $5, active = $6
               WHERE id = $7`,
              [nextName, nextTotem, nextFilter, nextStock, nextSort, nextActive, targetId],
            );
          } else {
            // Se ainda não existia no banco, cria o registro diretamente
            await client.query(
              `INSERT INTO product_attributes (id, store_id, name, use_on_totem, filter_on_totem, use_on_stock, sort, active)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               ON CONFLICT (id) DO UPDATE SET name = $3`,
              [targetId, storeId, nextName, nextTotem, nextFilter, nextStock, nextSort, nextActive],
            );
          }

          if (body.values !== undefined) {
            await client.query(`DELETE FROM product_attribute_values WHERE attribute_id = $1`, [targetId]);
            let sortIdx = 0;
            for (const val of body.values) {
              const cleanVal = val.trim();
              if (!cleanVal) continue;
              const delta = (body.priceDeltas && body.priceDeltas[cleanVal]) || 0;
              const valId = `ATV-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
              await client.query(
                `INSERT INTO product_attribute_values (id, attribute_id, value, price_delta, sort)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (attribute_id, value) DO UPDATE SET price_delta = $4, sort = $5`,
                [valId, targetId, cleanVal, delta, sortIdx++],
              );
            }
          }

          await client.query('COMMIT');

          // Busca atualizado
          const updatedValRes = await pool.query(
            `SELECT value, price_delta, sort FROM product_attribute_values WHERE attribute_id = $1 ORDER BY sort ASC`,
            [targetId],
          );

          const updated = formatAttrResponse(
            { id: targetId, name: nextName, use_on_totem: nextTotem, filter_on_totem: nextFilter, use_on_stock: nextStock, sort: nextSort, active: nextActive },
            updatedValRes.rows,
          );

          res.json({ success: true, data: updated });
          return;
        } catch (err) {
          await client.query('ROLLBACK');
          console.error('[attributes] Erro ao atualizar atributo no banco:', err);
          throw err;
        } finally {
          client.release();
        }
      }
    }

    const current = memoryAttrs.get(id);
    if (!current) {
      // Se não encontrou pelo ID exato, tenta pelo nome
      const byName = Array.from(memoryAttrs.values()).find((a) => a.name.toLowerCase() === (body.name || id).toLowerCase());
      if (byName) {
        const updated = { ...byName, ...body };
        memoryAttrs.set(byName.id, updated);
        res.json({ success: true, data: updated });
        return;
      }
    }
    const updated = { ...current, id, storeId, ...body };
    memoryAttrs.set(id, updated);
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
}

attributesRouter.patch('/api/v1/attributes/:id', requireOrDemoAuth, handleUpdateAttribute);
attributesRouter.put('/api/v1/attributes/:id', requireOrDemoAuth, handleUpdateAttribute);

/**
 * Excluir atributo
 */
attributesRouter.delete('/api/v1/attributes/:id', requireOrDemoAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId || 'STR-DEMO-01';
    const id = req.params.id;

    if (pool) {
      try {
        await pool.query(
          `DELETE FROM product_attributes WHERE id = $1 AND store_id = $2`,
          [id, storeId],
        );
        res.json({ success: true, data: { ok: true } });
        return;
      } catch (dbErr) {
        console.warn('[attributes] Falha ao deletar atributo do banco, usando memória:', dbErr);
      }
    }

    memoryAttrs.delete(id);
    res.json({ success: true, data: { ok: true } });
  } catch (error) {
    next(error);
  }
});
