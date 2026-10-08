import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { pool } from '../db/pool.js';

export const peopleRouter = Router();

const VIACEP_URL = 'https://viacep.com.br/ws';
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');

type ViaCepRow = { cep?: string; logradouro?: string; complemento?: string; bairro?: string; localidade?: string; uf?: string; erro?: boolean | string };

function toAddress(row: ViaCepRow) {
  return {
    zipCode: digits(row.cep).replace(/^(\d{5})(\d{3})$/, '$1-$2'),
    street: row.logradouro ?? '',
    district: row.bairro ?? '',
    city: row.localidade ?? '',
    state: (row.uf ?? '').toUpperCase(),
    complement: row.complemento ?? '',
  };
}

async function viaCep(path: string) {
  const response = await fetch(`${VIACEP_URL}/${path}/json/`, {
    headers: { accept: 'application/json', 'user-agent': 'MarthiTec/1.0' },
    signal: AbortSignal.timeout(7000),
  });
  if (response.status === 400) return null;
  if (!response.ok) throw Object.assign(new Error('Serviço de endereços indisponível agora. Tente de novo.'), { status: 502 });
  return (await response.json()) as ViaCepRow | ViaCepRow[];
}

/** Endereço pelo CEP. */
peopleRouter.get('/api/v1/address/cep/:cep', requireAuth, async (req, res, next) => {
  try {
    const cep = digits(req.params.cep);
    if (cep.length !== 8) throw Object.assign(new Error('CEP deve ter 8 números.'), { status: 400 });
    const row = (await viaCep(cep)) as ViaCepRow | null;
    if (!row || row.erro) {
      res.status(404).json({ success: false, error: { code: 'CEP_NOT_FOUND', message: 'CEP não encontrado.' } });
      return;
    }
    res.json({ success: true, data: toAddress(row) });
  } catch (error) {
    next(error);
  }
});

/** Busca pelo nome da rua (a cidade e o estado vêm da loja e podem ser trocados na tela). */
peopleRouter.get('/api/v1/address/search', requireAuth, async (req, res, next) => {
  try {
    const q = z
      .object({ uf: z.string().trim().length(2), city: z.string().trim().min(3).max(80), street: z.string().trim().min(3).max(120) })
      .parse(req.query);
    const path = [q.uf.toUpperCase(), q.city, q.street].map((part) => encodeURIComponent(part)).join('/');
    const rows = await viaCep(path);
    const list = Array.isArray(rows) ? rows.slice(0, 15).map(toAddress) : [];
    res.json({ success: true, data: list });
  } catch (error) {
    next(error);
  }
});

/**
 * Resumo do cliente para a loja: compras, formas de pagamento, produtos e serviços (OS).
 * Junta pelo cadastro do cliente e, nas vendas sem cadastro, pelo telefone.
 */
peopleRouter.get('/api/v1/customers/:id/summary', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const customer = (await pool.query('SELECT * FROM customers WHERE id = $1 AND store_id = $2', [req.params.id, storeId])).rows[0];
    if (!customer) {
      res.status(404).json({ success: false, error: { message: 'Cliente não encontrado.' } });
      return;
    }
    // Mesmo número com ou sem +55: compara DDD + número (últimos 10 dígitos).
    const phone = digits(customer.phone).slice(-10);
    const match = `s.store_id = $1 AND (s.customer_id = $2 OR ($3 <> '' AND s.customer_id IS NULL AND right(regexp_replace(coalesce(s.customer_phone, ''), '\\D', '', 'g'), 10) = $3))`;
    const args = [storeId, customer.id, phone.length === 10 ? phone : ''];
    const amount = `COALESCE(NULLIF(s.final_amount, 0), NULLIF(s.amount, 0), s.total, 0)`;
    const totals = (
      await pool.query(
        `SELECT count(*) FILTER (WHERE s.status IS DISTINCT FROM 'cancelled')::int AS sales,
                count(*) FILTER (WHERE s.status = 'cancelled')::int AS cancelled,
                COALESCE(sum(${amount}) FILTER (WHERE s.status IS DISTINCT FROM 'cancelled'), 0) AS total,
                max(s.created_at) FILTER (WHERE s.status IS DISTINCT FROM 'cancelled') AS last_purchase
           FROM sales_orders s WHERE ${match}`,
        args,
      )
    ).rows[0];
    const payments = (
      await pool.query(
        `SELECT COALESCE(NULLIF(p.method_name, ''), NULLIF(p.method, ''), 'Outro') AS method, count(*)::int AS times, COALESCE(sum(p.amount), 0) AS amount
           FROM sale_payments p JOIN sales_orders s ON s.id = p.sale_id
          WHERE ${match} AND s.status IS DISTINCT FROM 'cancelled'
          GROUP BY 1 ORDER BY 3 DESC`,
        args,
      )
    ).rows;
    const products = (
      await pool.query(
        `SELECT l.name, sum(l.qty)::int AS qty, COALESCE(sum(l.total_price), 0) AS amount, max(s.created_at) AS last_at
           FROM sales_order_lines l JOIN sales_orders s ON s.id = COALESCE(l.sale_id, l.order_id)
          WHERE ${match} AND s.status IS DISTINCT FROM 'cancelled'
          GROUP BY l.name ORDER BY max(s.created_at) DESC LIMIT 20`,
        args,
      )
    ).rows;
    const services = (
      await pool.query(
        `SELECT w.id, w.device_brand, w.device_model, w.status, COALESCE(w.total_amount, 0) AS total, w.created_at
           FROM work_orders w
          WHERE w.store_id = $1 AND (w.customer_id = $2 OR ($3 <> '' AND right(regexp_replace(coalesce(w.customer_phone, ''), '\\D', '', 'g'), 10) = $3))
          ORDER BY w.created_at DESC LIMIT 20`,
        args,
      )
    ).rows;
    const seller = customer.seller_id
      ? (await pool.query('SELECT name FROM sellers WHERE id = $1 AND store_id = $2', [customer.seller_id, storeId])).rows[0]
      : null;
    res.json({
      success: true,
      data: {
        salesCount: Number(totals.sales) || 0,
        cancelledCount: Number(totals.cancelled) || 0,
        totalSpent: Number(totals.total) || 0,
        averageTicket: Number(totals.sales) ? Number(totals.total) / Number(totals.sales) : 0,
        lastPurchaseAt: totals.last_purchase,
        sellerName: seller?.name ?? '',
        payments: payments.map((row) => ({ method: row.method, times: row.times, amount: Number(row.amount) })),
        products: products.map((row) => ({ name: row.name, qty: row.qty, amount: Number(row.amount), lastAt: row.last_at })),
        services: services.map((row) => ({
          id: row.id,
          device: [row.device_brand, row.device_model].filter(Boolean).join(' '),
          status: row.status,
          total: Number(row.total),
          createdAt: row.created_at,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});
