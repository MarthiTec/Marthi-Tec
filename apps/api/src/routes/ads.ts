import { randomUUID } from 'node:crypto';
import express, { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { canManageArea } from '../services/employeeAccess.js';
import { publicOffer } from '../services/ads/adContent.js';
import { checkImage, checkVideo, dataUrlBytes } from '../services/ads/adMedia.js';
import {
  audit,
  disconnectMeta,
  finishMetaConnect,
  getConnection,
  handleDataDeletion,
  listMetaAssets,
  markNeedsReconnect,
  metaConfig,
  metaHealth,
  publicConnection,
  selectMetaAssets,
  startMetaConnect,
  userToken,
} from '../services/ads/metaConnection.js';
import {
  activateCampaign,
  budgetSchema,
  campaignInsights,
  createDraft,
  deleteDraft,
  getCampaign,
  INSIGHT_PRESETS,
  listCampaigns,
  pauseCampaign,
  resubmitCreative,
  searchCities,
  submitCampaign,
  syncCampaign,
  updateDraft,
  validateCampaign,
} from '../services/ads/metaCampaigns.js';
import { explainMetaError, graph } from '../services/ads/metaGraph.js';

/**
 * Marthi ADS. Quem pode:
 * - montar e editar anúncios: gestão da loja ou funcionário com a área "Anúncios Ads";
 * - conectar contas e autorizar gastos (ativar): só administrador/dono da loja.
 */
export const adsRouter = Router();

const ADMIN_ROLES = new Set(['admin', 'owner', 'superadmin']);
const actorOf = (req: Request) => req.user?.name || req.user?.email || 'Operador';

function requireAdsEditor(req: Request, res: Response, next: NextFunction) {
  if (canManageArea(req)) return next();
  res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Seu acesso não inclui Anúncios Ads. Peça ao administrador.' } });
}
function requireAdsAdmin(req: Request, res: Response, next: NextFunction) {
  if (ADMIN_ROLES.has(String(req.user?.role ?? '').toLowerCase())) return next();
  res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Só o administrador da loja conecta contas e autoriza gastos com anúncios.' } });
}
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => {
  fn(req, res).catch(next);
};

/* ── Conexão Meta ─────────────────────────────────────────────── */

adsRouter.get('/api/v1/ads/status', requireAuth, requireAdsEditor, wrap(async (req, res) => {
  const connection = await getConnection(pool, req.storeId!);
  res.json({
    success: true,
    data: {
      config: metaConfig(),
      connection: publicConnection(connection),
      canAdmin: ADMIN_ROLES.has(String(req.user?.role ?? '').toLowerCase()),
      phases: {
        facebookAds: 'available',
        credits: 'blocked',
        instagramAds: 'blocked',
        instagramOrganic: 'blocked',
        googleAds: 'blocked',
        youtubeAds: 'blocked',
      },
    },
  });
}));

adsRouter.post('/api/v1/ads/meta/connect', requireAuth, requireAdsAdmin, wrap(async (req, res) => {
  const data = await startMetaConnect(req.storeId!, { id: String(req.user?.id ?? ''), name: actorOf(req) });
  await audit(pool, req.storeId!, actorOf(req), 'meta.connect_started');
  res.json({ success: true, data });
}));

/** Retorno do login da Meta (sem sessão do Marthi: a loja vem do `state` de uso único). */
adsRouter.get('/api/v1/ads/meta/callback', async (req, res) => {
  const front = `${env.FRONTEND_URL.replace(/\/$/, '')}/painel/ads/contas`;
  try {
    const result = await finishMetaConnect(req.query as Record<string, string>);
    res.redirect(result.ok ? `${front}?meta=ok` : `${front}?meta=cancelado&motivo=${encodeURIComponent(result.reason)}`);
  } catch (error) {
    res.redirect(`${front}?meta=erro&motivo=${encodeURIComponent(explainMetaError(error))}`);
  }
});

adsRouter.get('/api/v1/ads/meta/assets', requireAuth, requireAdsAdmin, wrap(async (req, res) => {
  res.json({ success: true, data: await listMetaAssets(req.storeId!) });
}));

adsRouter.put('/api/v1/ads/meta/assets', requireAuth, requireAdsAdmin, wrap(async (req, res) => {
  const body = z.object({ pageId: z.string().min(1), adAccountId: z.string().min(1) }).parse(req.body);
  await selectMetaAssets(req.storeId!, body, actorOf(req));
  res.json({ success: true, data: await metaHealth(req.storeId!) });
}));

adsRouter.get('/api/v1/ads/meta/health', requireAuth, requireAdsEditor, wrap(async (req, res) => {
  res.json({ success: true, data: await metaHealth(req.storeId!) });
}));

adsRouter.delete('/api/v1/ads/meta/connection', requireAuth, requireAdsAdmin, wrap(async (req, res) => {
  await disconnectMeta(req.storeId!, actorOf(req));
  res.json({ success: true, data: { ok: true } });
}));

/** Exclusão de dados pedida pela pessoa no Facebook (callback oficial com signed_request). */
adsRouter.post('/api/v1/ads/meta/data-deletion', express.urlencoded({ extended: false }), wrap(async (req, res) => {
  res.json(await handleDataDeletion(String(req.body?.signed_request ?? '')));
}));
adsRouter.get('/api/v1/ads/meta/data-deletion/:code', wrap(async (req, res) => {
  const row = (await pool.query('SELECT status, created_at FROM ads_data_deletions WHERE confirmation_code = $1', [req.params.code])).rows[0];
  res.json({ success: true, data: row ? { status: row.status, requestedAt: row.created_at } : null });
}));

/* ── Campanhas ────────────────────────────────────────────────── */

adsRouter.get('/api/v1/ads/campaigns', requireAuth, requireAdsEditor, wrap(async (req, res) => {
  res.json({ success: true, data: await listCampaigns(req.storeId!) });
}));

adsRouter.post('/api/v1/ads/campaigns', requireAuth, requireAdsEditor, wrap(async (req, res) => {
  const body = z.object({ productId: z.string().min(1), variationId: z.string().nullable().optional() }).parse(req.body);
  res.status(201).json({ success: true, data: await createDraft(req.storeId!, actorOf(req), body) });
}));

adsRouter.get('/api/v1/ads/campaigns/:id', requireAuth, requireAdsEditor, wrap(async (req, res) => {
  res.json({ success: true, data: await getCampaign(req.storeId!, req.params.id) });
}));

adsRouter.put('/api/v1/ads/campaigns/:id', requireAuth, requireAdsEditor, wrap(async (req, res) => {
  const body = z.object({ name: z.string().max(200).optional(), content: z.unknown().optional(), audience: z.unknown().optional(), budget: budgetSchema.optional() }).parse(req.body);
  res.json({ success: true, data: await updateDraft(req.storeId!, req.params.id, actorOf(req), body) });
}));

adsRouter.delete('/api/v1/ads/campaigns/:id', requireAuth, requireAdsEditor, wrap(async (req, res) => {
  await deleteDraft(req.storeId!, req.params.id, actorOf(req));
  res.json({ success: true, data: { ok: true } });
}));

adsRouter.get('/api/v1/ads/campaigns/:id/validation', requireAuth, requireAdsEditor, wrap(async (req, res) => {
  res.json({ success: true, data: await validateCampaign(req.storeId!, req.params.id) });
}));

/** Enviar para a Meta (tudo PAUSADO). A chave de envio evita duplicar em clique duplo ou repetição. */
adsRouter.post('/api/v1/ads/campaigns/:id/submit', requireAuth, requireAdsEditor, wrap(async (req, res) => {
  const body = z.object({ confirm: z.literal(true), submitKey: z.string().min(8).max(100) }).parse(req.body);
  res.json({ success: true, data: await submitCampaign(req.storeId!, req.params.id, actorOf(req), body) });
}));

adsRouter.post('/api/v1/ads/campaigns/:id/resubmit', requireAuth, requireAdsEditor, wrap(async (req, res) => {
  res.json({ success: true, data: await resubmitCreative(req.storeId!, req.params.id, actorOf(req)) });
}));

/** Autorizar o gasto (ativar) — só administrador, com o valor confirmado. */
adsRouter.post('/api/v1/ads/campaigns/:id/activate', requireAuth, requireAdsAdmin, wrap(async (req, res) => {
  const body = z.object({ confirm: z.literal(true), acknowledgedBudgetMinor: z.number().int().positive() }).parse(req.body);
  res.json({ success: true, data: await activateCampaign(req.storeId!, req.params.id, actorOf(req), body) });
}));

adsRouter.post('/api/v1/ads/campaigns/:id/pause', requireAuth, requireAdsEditor, wrap(async (req, res) => {
  res.json({ success: true, data: await pauseCampaign(req.storeId!, req.params.id, actorOf(req)) });
}));

adsRouter.post('/api/v1/ads/campaigns/:id/sync', requireAuth, requireAdsEditor, wrap(async (req, res) => {
  res.json({ success: true, data: await syncCampaign(req.storeId!, req.params.id) });
}));

adsRouter.get('/api/v1/ads/campaigns/:id/insights', requireAuth, requireAdsEditor, wrap(async (req, res) => {
  const preset = z.enum(INSIGHT_PRESETS).default('maximum').parse(req.query.preset ?? undefined);
  res.json({ success: true, data: await campaignInsights(req.storeId!, req.params.id, preset) });
}));

adsRouter.get('/api/v1/ads/meta/cities', requireAuth, requireAdsEditor, wrap(async (req, res) => {
  const q = z.string().trim().min(2).max(80).parse(req.query.q);
  res.json({ success: true, data: await searchCities(req.storeId!, q) });
}));

adsRouter.get('/api/v1/ads/audit', requireAuth, requireAdsAdmin, wrap(async (req, res) => {
  const rows = (await pool.query('SELECT actor, action, entity_id, details, created_at FROM ads_audit WHERE store_id = $1 ORDER BY created_at DESC LIMIT 100', [req.storeId])).rows;
  res.json({ success: true, data: rows });
}));

/* ── Fotos e vídeos ───────────────────────────────────────────── */

const mediaRow = (row: any) => ({
  id: row.id,
  kind: row.kind,
  name: row.name,
  mime: row.mime,
  sizeBytes: Number(row.size_bytes),
  width: row.width,
  height: row.height,
  durationSec: row.duration_sec != null ? Number(row.duration_sec) : null,
  preview: row.kind === 'image' ? row.data_url : row.thumbnail_url,
  status: row.kind === 'video' ? row.external_status || 'processing' : 'ready',
  rightsConfirmed: row.rights_confirmed,
  createdAt: row.created_at,
});

adsRouter.get('/api/v1/ads/media', requireAuth, requireAdsEditor, wrap(async (req, res) => {
  const rows = (await pool.query('SELECT * FROM ads_media WHERE store_id = $1 ORDER BY created_at DESC LIMIT 200', [req.storeId])).rows;
  res.json({ success: true, data: rows.map(mediaRow) });
}));

adsRouter.post('/api/v1/ads/media/image', requireAuth, requireAdsEditor, wrap(async (req, res) => {
  const body = z.object({ name: z.string().trim().min(1).max(160), dataUrl: z.string().min(20), rightsConfirmed: z.literal(true) }).parse(req.body);
  const parsed = dataUrlBytes(body.dataUrl);
  if (!parsed) throw Object.assign(new Error('Envie a imagem como arquivo JPG ou PNG.'), { status: 400 });
  const check = checkImage(parsed.bytes);
  const errors = check.issues.filter((issue) => issue.level === 'error');
  if (errors.length) throw Object.assign(new Error(errors.map((issue) => issue.message).join(' ')), { status: 400 });
  const id = `MED-${randomUUID()}`;
  await pool.query(
    `INSERT INTO ads_media (id, store_id, kind, name, mime, size_bytes, width, height, data_url, rights_confirmed, created_by) VALUES ($1, $2, 'image', $3, $4, $5, $6, $7, $8, true, $9)`,
    [id, req.storeId, body.name, check.mime, parsed.bytes.length, check.width, check.height, body.dataUrl, actorOf(req)],
  );
  const row = (await pool.query('SELECT * FROM ads_media WHERE id = $1', [id])).rows[0];
  res.status(201).json({ success: true, data: { ...mediaRow(row), warnings: check.issues.filter((issue) => issue.level === 'warning') } });
}));

/** Vídeo vai direto para a conta de anúncios da Meta (o Marthi guarda o ID e a miniatura). */
adsRouter.post(
  '/api/v1/ads/media/video',
  requireAuth,
  requireAdsEditor,
  express.raw({ type: ['video/mp4', 'video/quicktime'], limit: '100mb' }),
  wrap(async (req, res) => {
    const mime = String(req.headers['content-type'] ?? '');
    const name = decodeURIComponent(String(req.headers['x-file-name'] ?? 'video.mp4')).slice(0, 160);
    if (String(req.headers['x-rights-confirmed']) !== 'true') throw Object.assign(new Error('Confirme que você tem direito de usar este vídeo.'), { status: 400 });
    const bytes: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const errors = checkVideo({ mime, bytes: bytes.length }).filter((issue) => issue.level === 'error');
    if (!bytes.length) errors.push({ level: 'error', message: 'Arquivo de vídeo vazio.' });
    if (errors.length) throw Object.assign(new Error(errors.map((issue) => issue.message).join(' ')), { status: 400 });
    const { connection, token } = await userToken(req.storeId!);
    if (!connection.ad_account_id) throw Object.assign(new Error('Escolha a conta de anúncios em Contas conectadas antes de enviar vídeos.'), { status: 409 });
    const form = new FormData();
    form.set('source', new Blob([new Uint8Array(bytes)], { type: mime }), name);
    let uploaded: any;
    try {
      uploaded = await graph('POST', `${connection.ad_account_id}/advideos`, { token, form, params: { name, title: name.slice(0, 250) }, timeoutMs: 180_000 });
    } catch (error) {
      await markNeedsReconnect(req.storeId!, error);
      throw Object.assign(new Error(explainMetaError(error)), { status: 422 });
    }
    const id = `MED-${randomUUID()}`;
    await pool.query(
      `INSERT INTO ads_media (id, store_id, kind, name, mime, size_bytes, provider, external_id, external_status, rights_confirmed, created_by) VALUES ($1, $2, 'video', $3, $4, $5, 'meta', $6, 'processing', true, $7)`,
      [id, req.storeId, name, mime, bytes.length, String(uploaded.id), actorOf(req)],
    );
    await audit(pool, req.storeId!, actorOf(req), 'media.video_uploaded', id, { videoId: String(uploaded.id) });
    res.status(201).json({ success: true, data: mediaRow((await pool.query('SELECT * FROM ads_media WHERE id = $1', [id])).rows[0]) });
  }),
);

/** Situação do processamento do vídeo na Meta, duração e miniatura. */
adsRouter.post('/api/v1/ads/media/:id/refresh', requireAuth, requireAdsEditor, wrap(async (req, res) => {
  const row = (await pool.query('SELECT * FROM ads_media WHERE id = $1 AND store_id = $2', [req.params.id, req.storeId])).rows[0];
  if (!row) throw Object.assign(new Error('Mídia não encontrada.'), { status: 404 });
  if (row.kind !== 'video' || !row.external_id) return void res.json({ success: true, data: mediaRow(row) });
  const { token } = await userToken(req.storeId!);
  try {
    const video: any = await graph('GET', row.external_id, { token, params: { fields: 'status,length' } });
    const status = String(video?.status?.video_status ?? 'processing');
    let thumbnail = row.thumbnail_url;
    if (status === 'ready') {
      const thumbs: any = await graph('GET', `${row.external_id}/thumbnails`, { token, params: { fields: 'uri,is_preferred' } });
      const list: any[] = thumbs?.data ?? [];
      thumbnail = String((list.find((item) => item.is_preferred) ?? list[0])?.uri ?? thumbnail ?? '');
    }
    const duration = video?.length != null ? Number(video.length) : null;
    const problems = duration != null ? checkVideo({ mime: row.mime, bytes: Number(row.size_bytes), durationSec: duration }).filter((issue) => issue.level === 'error') : [];
    await pool.query('UPDATE ads_media SET external_status = $3, duration_sec = $4, thumbnail_url = $5 WHERE id = $1 AND store_id = $2', [
      row.id,
      req.storeId,
      problems.length ? 'error' : status,
      duration,
      thumbnail || '',
    ]);
  } catch (error) {
    await markNeedsReconnect(req.storeId!, error);
    throw Object.assign(new Error(explainMetaError(error)), { status: 422 });
  }
  res.json({ success: true, data: mediaRow((await pool.query('SELECT * FROM ads_media WHERE id = $1', [row.id])).rows[0]) });
}));

adsRouter.delete('/api/v1/ads/media/:id', requireAuth, requireAdsEditor, wrap(async (req, res) => {
  const used = (await pool.query(`SELECT 1 FROM ads_campaigns WHERE store_id = $1 AND content->'media'->>'mediaId' = $2 AND submit_state <> 'draft' LIMIT 1`, [req.storeId, req.params.id])).rows[0];
  if (used) throw Object.assign(new Error('Esta mídia está em uma campanha enviada e não pode ser apagada.'), { status: 409 });
  await pool.query('DELETE FROM ads_media WHERE id = $1 AND store_id = $2', [req.params.id, req.storeId]);
  res.json({ success: true, data: { ok: true } });
}));

/* ── Página pública do produto (destino do anúncio) ──────────── */

adsRouter.get('/api/v1/public/offers/:storeId/:productId', wrap(async (req, res) => {
  const store = (await pool.query('SELECT id FROM stores WHERE id = $1 AND active = true', [req.params.storeId])).rows[0];
  if (!store) throw Object.assign(new Error('Loja não encontrada.'), { status: 404 });
  const variationId = typeof req.query.v === 'string' && req.query.v ? req.query.v : null;
  res.json({ success: true, data: await publicOffer(pool, req.params.storeId, req.params.productId, variationId) });
}));
