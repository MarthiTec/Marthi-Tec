import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { pool } from '../db/pool.js';

export const storeProfileRouter = Router();

type Queryable = { query: (sql: string, args?: unknown[]) => Promise<{ rows: any[] }> };

/** "@loja", "loja" ou o link inteiro viram o link do perfil. */
export function instagramUrl(value: string) {
  const v = value.trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  const handle = v.replace(/^@/, '').replace(/^(www\.)?instagram\.com\//i, '').replace(/\/+$/, '');
  return handle ? `https://instagram.com/${handle}` : '';
}

export function instagramHandle(value: string) {
  const url = instagramUrl(value);
  const match = /instagram\.com\/([^/?#]+)/i.exec(url);
  return match ? `@${match[1]}` : '';
}

export function withProtocol(value: string) {
  const v = value.trim();
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

/**
 * Dados da loja usados em comprovantes, mensagens e no totem. A logo é uma só: se a loja ainda
 * não enviou em Operações, vale a que já estava no totem (e vice-versa).
 */
export async function getStoreBrandProfile(db: Queryable, storeId: string) {
  const row = (
    await db.query(
      `SELECT trade_name, legal_name, phone, email, logo, instagram, facebook, website, message_signature, totem_settings
         FROM stores WHERE id = $1`,
      [storeId],
    )
  ).rows[0];
  if (!row) return null;
  const totem = typeof row.totem_settings === 'string' ? JSON.parse(row.totem_settings || '{}') : row.totem_settings || {};
  return {
    name: row.trade_name || '',
    legalName: row.legal_name || '',
    // '(24) 99999-9999' é o valor de exemplo do cadastro antigo: não é telefone da loja.
    phone: row.phone && row.phone !== '(24) 99999-9999' ? row.phone : '',
    email: row.email || '',
    logo: row.logo || totem.storeLogo || null,
    logoFromTotem: !row.logo && Boolean(totem.storeLogo),
    instagram: row.instagram || '',
    facebook: row.facebook || '',
    website: row.website || '',
    signature: row.message_signature || '',
  };
}

/** Assinatura das mensagens: a escrita pela loja ou, sem ela, nome e contatos da loja. */
export function messageSignature(profile: NonNullable<Awaited<ReturnType<typeof getStoreBrandProfile>>>) {
  if (profile.signature.trim()) return profile.signature.trim();
  return [
    `*${profile.name}*`,
    profile.phone ? `📞 ${profile.phone}` : '',
    profile.instagram ? `📸 Instagram: ${instagramHandle(profile.instagram) || profile.instagram}` : '',
    profile.website ? `🌐 ${profile.website.replace(/^https?:\/\//i, '')}` : '',
  ].filter(Boolean).join('\n');
}

const profileSchema = z.object({
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().max(120).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'E-mail inválido.').optional(),
  logo: z.string().startsWith('data:image/').max(1_500_000).nullable().optional(),
  instagram: z.string().trim().max(120).optional(),
  facebook: z.string().trim().max(200).optional(),
  website: z.string().trim().max(200).optional(),
  signature: z.string().trim().max(600).optional(),
});

storeProfileRouter.get('/api/v1/store/brand-profile', requireAuth, async (req, res, next) => {
  try {
    const profile = await getStoreBrandProfile(pool, req.storeId!);
    if (!profile) {
      res.status(404).json({ success: false, error: { message: 'Loja não encontrada.' } });
      return;
    }
    res.json({ success: true, data: profile });
  } catch (error) {
    next(error);
  }
});

storeProfileRouter.put('/api/v1/store/brand-profile', requireAuth, async (req, res, next) => {
  try {
    if (!['admin', 'manager', 'superadmin', 'owner'].includes(String(req.user?.role ?? ''))) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Somente o administrador ou gerente altera os dados da loja.' } });
      return;
    }
    const body = profileSchema.parse(req.body);
    const sets: string[] = [];
    const args: unknown[] = [req.storeId];
    const push = (column: string, value: unknown) => {
      args.push(value);
      sets.push(`${column} = $${args.length}`);
    };
    if (body.phone !== undefined) push('phone', body.phone);
    if (body.email !== undefined) push('email', body.email);
    if (body.logo !== undefined) push('logo', body.logo);
    if (body.instagram !== undefined) push('instagram', body.instagram);
    if (body.facebook !== undefined) push('facebook', body.facebook);
    if (body.website !== undefined) push('website', body.website);
    if (body.signature !== undefined) push('message_signature', body.signature);
    if (sets.length) await pool.query(`UPDATE stores SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, args);
    res.json({ success: true, data: await getStoreBrandProfile(pool, req.storeId!) });
  } catch (error) {
    next(error);
  }
});
