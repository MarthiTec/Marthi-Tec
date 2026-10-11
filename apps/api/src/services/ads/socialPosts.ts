import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { pool } from '../../db/pool.js';
import { checkImage, dataUrlBytes } from './adMedia.js';
import { audit, getConnection, markNeedsReconnect, userToken } from './metaConnection.js';
import { explainMetaError, graph, MetaApiError, MetaTimeoutError } from './metaGraph.js';

/**
 * Publicações programadas no Instagram (orgânicas, sem custo). A Meta não agenda publicações do Instagram
 * pela API: o Marthi guarda o horário e publica na hora certa (container + media_publish). A imagem vai
 * por um link público assinado, válido só enquanto a publicação está agendada/publicando.
 * Regras do Instagram (Content Publishing API): imagem JPEG, proporção entre 4:5 e 1,91:1, legenda até
 * 2.200 caracteres e até 30 hashtags.
 */
const MAX_CAPTION = 2200;
const MAX_HASHTAGS = 30;
const MAX_DAYS_AHEAD = 75;

type PostRow = Record<string, any>;

function signature(postId: string, mediaId: string) {
  return createHmac('sha256', env.JWT_SECRET).update(`social:${postId}:${mediaId}`).digest('hex').slice(0, 40);
}

export function socialMediaUrl(post: { id: string; media_id: string }) {
  const base = (env.PUBLIC_API_URL || env.FRONTEND_URL).replace(/\/$/, '');
  return `${base}/api/v1/public/social-media/${encodeURIComponent(post.id)}/${signature(post.id, post.media_id)}.jpg`;
}

/** Imagem da publicação para a Meta buscar (só com assinatura válida e enquanto agendada/publicando). */
export async function readSocialMedia(postId: string, sig: string) {
  const post = (await pool.query(`SELECT id, media_id, status FROM ads_social_posts WHERE id = $1`, [postId])).rows[0];
  if (!post?.media_id || !['scheduled', 'publishing'].includes(post.status)) return null;
  const expected = Buffer.from(signature(post.id, post.media_id));
  const received = Buffer.from(String(sig).replace(/\.jpg$/, ''));
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  const media = (await pool.query(`SELECT data_url FROM ads_media WHERE id = $1`, [post.media_id])).rows[0];
  return media?.data_url ? dataUrlBytes(media.data_url) : null;
}

function publicPost(row: PostRow) {
  return {
    id: row.id,
    network: row.network,
    caption: row.caption,
    mediaId: row.media_id,
    mediaName: row.media_name ?? '',
    status: row.status,
    scheduledAt: row.scheduled_at,
    publishedAt: row.published_at,
    permalink: row.permalink,
    error: row.error,
    attempts: row.attempts,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export async function listSocialPosts(storeId: string) {
  const rows = (
    await pool.query(
      `SELECT p.*, m.name AS media_name FROM ads_social_posts p LEFT JOIN ads_media m ON m.id = p.media_id
        WHERE p.store_id = $1 ORDER BY p.scheduled_at DESC LIMIT 200`,
      [storeId],
    )
  ).rows;
  return rows.map(publicPost);
}

/** Cria a publicação: confere Instagram, imagem e legenda; agenda ou publica na hora. */
export async function createSocialPost(storeId: string, input: { caption: string; mediaId: string; scheduledAt?: string | null }, actor: string) {
  const connection = await getConnection(pool, storeId);
  if (!connection || connection.status !== 'connected' || !connection.token_enc) {
    throw Object.assign(new Error('Conecte a Meta da loja em Operações › Meta (Facebook e Instagram) antes de publicar.'), { status: 409 });
  }
  if (!connection.instagram_id) throw Object.assign(new Error('Nenhum Instagram profissional ligado à Página da loja. Vincule o Instagram à Página e valide de novo a conexão.'), { status: 409 });
  const caption = input.caption.trim();
  if (caption.length > MAX_CAPTION) throw Object.assign(new Error(`A legenda passa de ${MAX_CAPTION} caracteres.`), { status: 422 });
  if ((caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).length > MAX_HASHTAGS) throw Object.assign(new Error(`O Instagram aceita até ${MAX_HASHTAGS} hashtags por publicação.`), { status: 422 });
  const media = (await pool.query(`SELECT id, kind, data_url FROM ads_media WHERE id = $1 AND store_id = $2`, [input.mediaId, storeId])).rows[0];
  if (!media) throw Object.assign(new Error('Escolha uma foto da biblioteca da loja.'), { status: 422 });
  if (media.kind !== 'image' || !media.data_url) throw Object.assign(new Error('Por enquanto o Marthi publica fotos no Instagram. Escolha uma imagem.'), { status: 422 });
  const file = dataUrlBytes(media.data_url);
  const info = file ? checkImage(file.bytes) : null;
  if (!info || info.mime !== 'image/jpeg') throw Object.assign(new Error('O Instagram só aceita fotos em JPG. Salve a imagem como JPG e envie de novo na biblioteca.'), { status: 422 });
  const ratio = (info.width ?? 0) / (info.height ?? 1);
  if (ratio < 0.8 * 0.97 || ratio > 1.91 * 1.03) throw Object.assign(new Error('A proporção da foto precisa ficar entre 4:5 (em pé) e 1,91:1 (deitada). Recorte a imagem.'), { status: 422 });

  const now = Date.now();
  const when = input.scheduledAt ? new Date(input.scheduledAt) : new Date(now);
  if (Number.isNaN(when.getTime())) throw Object.assign(new Error('Data e hora inválidas.'), { status: 422 });
  if (input.scheduledAt && when.getTime() < now + 60_000) throw Object.assign(new Error('Escolha um horário a partir de 1 minuto no futuro, ou use "Publicar agora".'), { status: 422 });
  if (when.getTime() > now + MAX_DAYS_AHEAD * 86400_000) throw Object.assign(new Error(`Agende com até ${MAX_DAYS_AHEAD} dias de antecedência.`), { status: 422 });

  const id = `IGP-${randomUUID()}`;
  await pool.query(
    `INSERT INTO ads_social_posts (id, store_id, network, caption, media_id, status, scheduled_at, created_by) VALUES ($1, $2, 'instagram', $3, $4, 'scheduled', $5, $6)`,
    [id, storeId, caption, media.id, when.toISOString(), actor],
  );
  await audit(pool, storeId, actor, input.scheduledAt ? 'instagram.post_scheduled' : 'instagram.post_now', id, { scheduledAt: when.toISOString() });
  if (!input.scheduledAt) await publishSocialPost(id);
  const row = (await pool.query(`SELECT p.*, m.name AS media_name FROM ads_social_posts p LEFT JOIN ads_media m ON m.id = p.media_id WHERE p.id = $1`, [id])).rows[0];
  return publicPost(row);
}

export async function cancelSocialPost(storeId: string, id: string, actor: string) {
  const result = await pool.query(`UPDATE ads_social_posts SET status = 'cancelled', updated_at = now() WHERE id = $1 AND store_id = $2 AND status IN ('scheduled', 'failed') RETURNING id`, [id, storeId]);
  if (!result.rowCount) throw Object.assign(new Error('Só dá para cancelar publicação agendada ou que falhou.'), { status: 409 });
  await audit(pool, storeId, actor, 'instagram.post_cancelled', id);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Publica (container + media_publish). Pega a linha com trava para não publicar duas vezes. */
export async function publishSocialPost(id: string) {
  const post = (
    await pool.query(
      `UPDATE ads_social_posts SET status = 'publishing', attempts = attempts + 1, updated_at = now()
        WHERE id = $1 AND status = 'scheduled' AND scheduled_at <= now() + interval '30 seconds' RETURNING *`,
      [id],
    )
  ).rows[0];
  if (!post) return;
  try {
    const { connection, token } = await userToken(post.store_id);
    if (!connection.instagram_id) throw Object.assign(new Error('Nenhum Instagram profissional ligado à Página.'), { status: 409 });
    let containerId: string = post.container_id;
    if (!containerId) {
      const created: any = await graph('POST', `${connection.instagram_id}/media`, { token, params: { image_url: socialMediaUrl(post as any), caption: post.caption } });
      containerId = String(created.id);
      await pool.query(`UPDATE ads_social_posts SET container_id = $2, updated_at = now() WHERE id = $1`, [id, containerId]);
    }
    // Fotos costumam ficar prontas na hora; confere o estado antes de publicar.
    for (let i = 0; i < 6; i += 1) {
      const state: any = await graph('GET', containerId, { token, params: { fields: 'status_code' } });
      if (state.status_code === 'FINISHED' || !state.status_code) break;
      if (state.status_code === 'ERROR' || state.status_code === 'EXPIRED') throw Object.assign(new Error('A Meta não conseguiu processar a foto. Confira o formato (JPG) e a proporção.'), { status: 422 });
      await sleep(2000);
    }
    const published: any = await graph('POST', `${connection.instagram_id}/media_publish`, { token, params: { creation_id: containerId } });
    const mediaInfo: any = await graph('GET', String(published.id), { token, params: { fields: 'permalink' } }).catch(() => ({}));
    await pool.query(
      `UPDATE ads_social_posts SET status = 'published', external_id = $2, permalink = $3, published_at = now(), error = '', updated_at = now() WHERE id = $1`,
      [id, String(published.id), String(mediaInfo.permalink ?? '')],
    );
    await audit(pool, post.store_id, post.created_by || 'Marthi', 'instagram.post_published', id, { mediaId: String(published.id) });
  } catch (error) {
    await markNeedsReconnect(post.store_id, error).catch(() => undefined);
    const message = explainMetaError(error);
    // Limite/instabilidade da Meta: tenta de novo em 5 minutos (até 3 vezes). Timeout depois do container
    // não repete sozinho (pode ter publicado) — fica como falha para conferir no Instagram.
    const retry = error instanceof MetaApiError && error.transient && Number(post.attempts) < 3;
    const timedOut = error instanceof MetaTimeoutError;
    await pool.query(
      `UPDATE ads_social_posts SET status = $2, error = $3, scheduled_at = CASE WHEN $2 = 'scheduled' THEN now() + interval '5 minutes' ELSE scheduled_at END, updated_at = now() WHERE id = $1`,
      [id, retry ? 'scheduled' : 'failed', timedOut ? 'A Meta demorou para responder. Confira no Instagram se a publicação saiu antes de tentar de novo.' : message],
    );
    await audit(pool, post.store_id, 'Marthi', 'instagram.post_failed', id, { error: message, retry });
  }
}

let timer: NodeJS.Timeout | null = null;
/** Publica as agendadas que venceram (confere a cada minuto). */
export function startSocialPostsWorker() {
  if (timer) return;
  const tick = async () => {
    // Publicação travada em "publicando" há muito tempo: vira falha para conferir (sem repetir sozinha).
    await pool.query(
      `UPDATE ads_social_posts SET status = 'failed', error = 'A publicação não terminou. Confira no Instagram se saiu antes de tentar de novo.', updated_at = now()
        WHERE status = 'publishing' AND updated_at < now() - interval '15 minutes'`,
    );
    const due = (await pool.query(`SELECT id FROM ads_social_posts WHERE status = 'scheduled' AND scheduled_at <= now() ORDER BY scheduled_at LIMIT 10`)).rows;
    for (const row of due) await publishSocialPost(row.id).catch((error) => console.error('[instagram] Falha ao publicar:', error));
  };
  timer = setInterval(() => void tick().catch((error) => console.error('[instagram] Falha no agendador:', error)), 60 * 1000);
  setTimeout(() => void tick().catch(() => undefined), 20 * 1000);
}
