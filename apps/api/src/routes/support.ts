import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth, requirePlatformAdmin } from '../middlewares/authMiddleware.js';

/** Central de ajuda: contatos da Marthi (do banco) e pedidos de ajuste das lojas. */
export const supportRouter = Router();

const contactsSchema = z.object({
  email: z.string().trim().email('E-mail inválido.'),
  instagram: z.string().trim().max(60).transform((value) => value.replace(/^@/, '')),
  whatsapp: z.string().trim().transform((value) => value.replace(/\D/g, '')).refine((value) => !value || value.length >= 10, 'WhatsApp inválido.'),
  address: z.string().trim().max(200).default(''),
});

const ticketSchema = z.object({
  topic: z.enum(['ajuste', 'plano', 'acesso', 'totem', 'outro']),
  message: z.string().trim().min(3, 'Descreva o pedido.').max(2000),
});

function formatWhatsApp(digits: string) {
  const local = digits.startsWith('55') ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return digits;
}

function toContacts(value: any) {
  const email = String(value?.email ?? '');
  const instagram = String(value?.instagram ?? '');
  const whatsapp = String(value?.whatsapp ?? '');
  return {
    email,
    instagram,
    instagramUrl: instagram ? `https://instagram.com/${instagram}` : '',
    whatsapp,
    whatsappDisplay: whatsapp ? formatWhatsApp(whatsapp) : '',
    whatsappUrl: whatsapp ? `https://wa.me/${whatsapp.startsWith('55') ? whatsapp : '55' + whatsapp}` : '',
    address: String(value?.address ?? ''),
  };
}

async function readContacts() {
  const row = (await pool.query(`SELECT value FROM platform_settings WHERE key = 'support_contacts'`)).rows[0];
  return toContacts(row?.value ?? {});
}

supportRouter.get('/api/v1/support/contacts', requireAuth, async (_req, res, next) => {
  try {
    res.json({ success: true, data: await readContacts() });
  } catch (error) {
    next(error);
  }
});

supportRouter.put('/api/v1/support/contacts', requireAuth, requirePlatformAdmin, async (req, res, next) => {
  try {
    const body = contactsSchema.parse(req.body);
    await pool.query(
      `INSERT INTO platform_settings (key, value, updated_at) VALUES ('support_contacts', $1::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [JSON.stringify(body)],
    );
    res.json({ success: true, data: await readContacts() });
  } catch (error) {
    next(error);
  }
});

const toTicket = (row: any) => ({
  id: row.id,
  topic: row.topic,
  message: row.message,
  status: row.status,
  userName: row.user_name,
  userEmail: row.user_email,
  createdAt: row.created_at,
});

supportRouter.get('/api/v1/support/tickets', requireAuth, async (req, res, next) => {
  try {
    const rows = await pool.query('SELECT * FROM support_tickets WHERE store_id = $1 ORDER BY created_at DESC LIMIT 50', [req.storeId]);
    res.json({ success: true, data: rows.rows.map(toTicket) });
  } catch (error) {
    next(error);
  }
});

supportRouter.post('/api/v1/support/tickets', requireAuth, async (req, res, next) => {
  try {
    const body = ticketSchema.parse(req.body);
    const row = (
      await pool.query(
        `INSERT INTO support_tickets (id, store_id, user_id, user_name, user_email, topic, message)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [`SUP-${randomUUID()}`, req.storeId, req.user?.id ?? null, req.user?.name ?? '', req.user?.email ?? '', body.topic, body.message],
      )
    ).rows[0];
    res.status(201).json({ success: true, data: toTicket(row) });
  } catch (error) {
    next(error);
  }
});
