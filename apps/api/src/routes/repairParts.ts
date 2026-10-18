import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middlewares/authMiddleware.js';

/**
 * Peças de manutenção: itens do estoque usados nos reparos (telas, baterias, conectores…).
 *  - O vínculo peça ↔ aparelho vem do catálogo de manutenções: cada qualidade (opção) de um serviço
 *    aponta para a peça do estoque que ela consome (repair_services.options[].stockItemId).
 *  - Na OS, a peça sai do estoque com movimentação registrada e nunca deixa o saldo negativo.
 */
export const repairPartsRouter = Router();
repairPartsRouter.use('/api/v1/repair-parts', requireAuth);

type Db = { query: typeof pool.query };
const httpError = (message: string, status = 400) => Object.assign(new Error(message), { status });
const norm = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

export type PartLink = { serviceId: string; serviceName: string; optionId: string; optionName: string; brand: string; model: string; price: number | null };

/** Qualidades (opções) de cada serviço ativo da loja que apontam para uma peça do estoque. */
async function linksByPart(db: Db, storeId: string) {
  const rows = (await db.query('SELECT id, brand, model, name, options FROM repair_services WHERE store_id = $1 AND active = true', [storeId])).rows;
  const map = new Map<string, PartLink[]>();
  for (const row of rows) {
    for (const option of Array.isArray(row.options) ? row.options : []) {
      if (!option?.stockItemId || option.active === false) continue;
      const list = map.get(option.stockItemId) ?? [];
      list.push({ serviceId: row.id, serviceName: row.name, optionId: option.id, optionName: option.name, brand: row.brand, model: row.model, price: option.price ?? null });
      map.set(option.stockItemId, list);
    }
  }
  return map;
}

const partStatus = (qty: number, minQty: number) => (qty <= 0 ? 'out' : qty <= minQty ? 'low' : 'ok');
const viewPart = (row: any, links: PartLink[] = []) => {
  const qty = Number(row.qty) || 0;
  const minQty = Number(row.min_qty) || 0;
  return {
    id: row.id,
    name: row.name,
    sku: row.sku || '',
    brand: row.brand || '',
    category: row.category || '',
    kind: row.kind,
    qty,
    minQty,
    cost: Number(row.cost) || 0,
    price: Number(row.price) || 0,
    active: row.active !== false,
    status: partStatus(qty, minQty),
    links: links.sort((a, b) => collator.compare(`${a.brand} ${a.model}`, `${b.brand} ${b.model}`)),
  };
};
const PART_COLUMNS = 'id, name, sku, brand, category, kind, qty, min_qty, cost, price, active';

/**
 * Lista as peças. Com marca + modelo: só as peças ligadas aos serviços daquele aparelho (para a OS).
 * Sem aparelho: todas as peças de manutenção da loja (tipo peça ou vinculadas a algum serviço).
 */
repairPartsRouter.get('/api/v1/repair-parts', async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const brand = norm(req.query.brand);
    const model = norm(req.query.model);
    const links = await linksByPart(pool, storeId);
    let ids: string[] | null = null;
    if (model) {
      ids = [...links.entries()]
        .filter(([, list]) => list.some((link) => norm(link.model) === model && (!brand || norm(link.brand) === brand)))
        .map(([id]) => id);
      if (!ids.length) {
        res.json({ success: true, data: [] });
        return;
      }
    }
    const rows = ids
      ? (await pool.query(`SELECT ${PART_COLUMNS} FROM stock_items WHERE store_id = $1 AND id = ANY($2::text[])`, [storeId, ids])).rows
      : (await pool.query(`SELECT ${PART_COLUMNS} FROM stock_items WHERE store_id = $1 AND active = true AND (kind = 'part' OR id = ANY($2::text[]))`, [storeId, [...links.keys()]])).rows;
    const data = rows.map((row: any) => viewPart(row, links.get(row.id) ?? [])).sort((a: any, b: any) => collator.compare(a.name, b.name));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

const patchSchema = z.object({
  minQty: z.number().int().min(0).max(1_000_000).optional(),
  cost: z.number().min(0).max(1_000_000).optional(),
  price: z.number().min(0).max(1_000_000).optional(),
});

/** Estoque mínimo, custo e preço de venda da peça (a quantidade só muda por entrada, ajuste ou OS). */
repairPartsRouter.patch('/api/v1/repair-parts/:id', async (req, res, next) => {
  try {
    const body = patchSchema.parse(req.body ?? {});
    const row = (
      await pool.query(
        // Sem saldo não há o que ponderar: o custo médio acompanha o custo informado.
        `UPDATE stock_items SET min_qty = COALESCE($3::int, min_qty), cost = COALESCE($4::numeric, cost), price = COALESCE($5::numeric, price),
                avg_cost = CASE WHEN $4::numeric IS NOT NULL AND (qty <= 0 OR COALESCE(avg_cost, 0) = 0) THEN $4::numeric ELSE avg_cost END, updated_at = now()
          WHERE id = $1 AND store_id = $2 RETURNING ${PART_COLUMNS}`,
        [req.params.id, req.storeId, body.minQty ?? null, body.cost ?? null, body.price ?? null],
      )
    ).rows[0];
    if (!row) throw httpError('Peça não encontrada nesta loja.', 404);
    res.json({ success: true, data: viewPart(row, (await linksByPart(pool, req.storeId!)).get(row.id) ?? []) });
  } catch (error) {
    next(error);
  }
});

const linksSchema = z.object({
  links: z.array(z.object({ serviceId: z.string().trim().min(1).max(80), optionId: z.string().trim().min(1).max(60) })).max(300),
});

/** Em quais aparelhos/qualidades a peça é usada: grava o vínculo nas opções dos serviços. */
repairPartsRouter.put('/api/v1/repair-parts/:id/links', async (req, res, next) => {
  const client = await pool.connect();
  let open = false;
  try {
    const body = linksSchema.parse(req.body ?? {});
    const storeId = req.storeId!;
    const part = (await client.query(`SELECT ${PART_COLUMNS} FROM stock_items WHERE id = $1 AND store_id = $2`, [req.params.id, storeId])).rows[0];
    if (!part) throw httpError('Peça não encontrada nesta loja.', 404);
    const wanted = new Set(body.links.map((link) => `${link.serviceId}\u0000${link.optionId}`));
    await client.query('BEGIN');
    open = true;
    const services = (await client.query('SELECT id, options FROM repair_services WHERE store_id = $1 FOR UPDATE', [storeId])).rows;
    const known = new Set<string>();
    for (const service of services) {
      const options = Array.isArray(service.options) ? service.options : [];
      let changed = false;
      const next = options.map((option: any) => {
        const key = `${service.id}\u0000${option.id}`;
        known.add(key);
        if (wanted.has(key) && option.stockItemId !== part.id) {
          changed = true;
          return { ...option, stockItemId: part.id };
        }
        if (!wanted.has(key) && option.stockItemId === part.id) {
          changed = true;
          return { ...option, stockItemId: null };
        }
        return option;
      });
      if (changed) await client.query('UPDATE repair_services SET options = $3::jsonb, updated_at = now() WHERE id = $1 AND store_id = $2', [service.id, storeId, JSON.stringify(next)]);
    }
    const missing = [...wanted].filter((key) => !known.has(key));
    if (missing.length) throw httpError('Uma das qualidades escolhidas não existe mais no catálogo de manutenções. Atualize a página.');
    await client.query('COMMIT');
    open = false;
    res.json({ success: true, data: viewPart(part, (await linksByPart(pool, storeId)).get(part.id) ?? []) });
  } catch (error) {
    if (open) await client.query('ROLLBACK').catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

/* ── Baixa da peça na OS (usado pela abertura da OS e pela ficha) ─────────────── */

export const stockPartSchema = z.object({
  stockId: z.string().trim().min(1).max(80),
  qty: z.coerce.number().int().min(1).max(999).default(1),
  /** Preço ao cliente; 0 = já incluída no valor do serviço. Sem valor = preço de venda da peça. */
  unitPrice: z.coerce.number().min(0).max(1_000_000).optional(),
  /** Peça de outro aparelho / fora da lista do aparelho (improviso). */
  improvised: z.boolean().default(false),
  note: z.string().trim().max(200).default(''),
});
export type StockPartInput = z.infer<typeof stockPartSchema>;

/**
 * Baixa a peça do estoque da loja para a OS: confere o saldo (nunca fica negativo), registra a
 * movimentação e o custo no financeiro e devolve a linha da OS. Rode dentro da transação da OS.
 */
export async function consumeStockPart(db: Db, input: StockPartInput & { storeId: string; osId: string; operator: string }) {
  const item = (await db.query('SELECT id, name, qty, cost, avg_cost, price FROM stock_items WHERE id = $1 AND store_id = $2', [input.stockId, input.storeId])).rows[0];
  if (!item) throw httpError('Peça não encontrada no estoque desta loja.', 404);
  const qty = input.qty;
  const updated = (
    await db.query('UPDATE stock_items SET qty = qty - $3::int, updated_at = now() WHERE id = $1 AND store_id = $2 AND qty >= $3::int RETURNING qty', [item.id, input.storeId, qty])
  ).rows[0];
  if (!updated) throw httpError(`Estoque insuficiente de "${item.name}": ${Number(item.qty) || 0} disponível. Dê entrada da peça antes de usar.`, 409);
  const unitCost = Number(item.avg_cost) || Number(item.cost) || 0;
  const unitPrice = input.unitPrice ?? (Number(item.price) || 0);
  const newQty = Number(updated.qty);
  const note = [input.improvised ? 'Peça de outro aparelho (improviso)' : '', input.note].filter(Boolean).join(' — ');
  await db.query(
    `INSERT INTO stock_movements (id, store_id, stock_id, type, qty, previous_qty, new_qty, unit_cost, ref_type, ref_id, operator_name, notes)
     VALUES ($1, $2, $3, 'out', $4::int, $5::numeric, $6::int, $7::numeric, 'work_order', $8, $9, $10)`,
    [`MOV-${randomUUID()}`, input.storeId, item.id, qty, newQty + qty, newQty, unitCost, input.osId, input.operator || 'Operador', [`OS ${input.osId}`, note].filter(Boolean).join(' · ')],
  );
  const financeId = `FIN-${randomUUID()}`;
  await db.query(
    `INSERT INTO finance_entries (id, store_id, type, label, amount, source, ref_id, created_at)
     VALUES ($1, $2, 'out', $3, $4::numeric, 'os_part', $5, now())`,
    [financeId, input.storeId, `Consumo de peça OS ${input.osId}: ${item.name}`, unitCost * qty, input.osId],
  );
  return {
    id: `OL-${randomUUID().slice(0, 13)}`,
    stockId: item.id,
    name: item.name,
    qty,
    unitCost,
    unitPrice,
    kind: 'part',
    financeId,
    improvised: input.improvised,
    note: input.note,
  };
}

/** Devolve ao estoque a peça de uma linha da OS (estorno), com movimentação registrada. */
export async function returnStockPart(db: Db, input: { storeId: string; osId: string; line: any; operator: string }) {
  const qty = Math.max(1, Number(input.line.qty) || 1);
  const updated = (
    await db.query('UPDATE stock_items SET qty = qty + $3::int, updated_at = now() WHERE id = $1 AND store_id = $2 RETURNING qty', [input.line.stockId, input.storeId, qty])
  ).rows[0];
  if (!updated) return;
  const newQty = Number(updated.qty);
  await db.query(
    `INSERT INTO stock_movements (id, store_id, stock_id, type, qty, previous_qty, new_qty, unit_cost, ref_type, ref_id, operator_name, notes)
     VALUES ($1, $2, $3, 'in', $4::int, $5::numeric, $6::int, $7::numeric, 'work_order_reversal', $8, $9, $10)`,
    [`MOV-${randomUUID()}`, input.storeId, input.line.stockId, qty, newQty - qty, newQty, Number(input.line.unitCost) || 0, input.osId, input.operator || 'Operador', `Estorno da OS ${input.osId}`],
  );
}
