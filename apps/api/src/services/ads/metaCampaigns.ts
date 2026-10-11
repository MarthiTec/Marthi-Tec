import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { checkImage, dataUrlBytes, type MediaIssue } from './adMedia.js';
import { defaultAdCopy, publicOffer } from './adContent.js';
import { audit, getConnection, markNeedsReconnect, metaHealth, userToken } from './metaConnection.js';
import { explainMetaError, graph, MetaApiError, MetaTimeoutError } from './metaGraph.js';

/**
 * Campanhas da Fase 1: Tráfego para a página pública do produto, com imagem ou vídeo, só no Facebook.
 * Os objetos são criados PAUSADOS; ativar exige confirmação explícita de quem autoriza gastos.
 */

/** Chamadas para ação documentadas no enum da Meta e coerentes com levar ao site. */
export const CTA_OPTIONS = ['LEARN_MORE', 'SHOP_NOW', 'BUY_NOW'] as const;

export const contentSchema = z.object({
  headline: z.string().trim().min(1, 'Informe o título.').max(255),
  message: z.string().trim().min(1, 'Informe o texto do anúncio.').max(2000),
  description: z.string().trim().max(255).default(''),
  cta: z.enum(CTA_OPTIONS).default('LEARN_MORE'),
  media: z.object({
    source: z.enum(['product', 'library']),
    index: z.number().int().min(0).optional(),
    mediaId: z.string().optional(),
  }),
});
export const audienceSchema = z.object({
  countries: z.array(z.string().length(2)).default(['BR']),
  cities: z.array(z.object({ key: z.string().min(1), name: z.string().default('') })).max(25).default([]),
  ageMin: z.number().int().min(18).max(65).default(18),
  ageMax: z.number().int().min(18).max(65).default(65),
});
export const budgetSchema = z
  .object({
    budgetType: z.enum(['daily', 'lifetime']),
    budgetMinor: z.number().int().positive('Informe o orçamento.'),
    startTime: z.string().datetime({ offset: true }),
    endTime: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .refine((b) => b.budgetType === 'daily' || Boolean(b.endTime), 'Orçamento total precisa de data de término.')
  .refine((b) => !b.endTime || Date.parse(b.endTime) > Date.parse(b.startTime), 'O término precisa ser depois do início.');

type Content = z.infer<typeof contentSchema>;
type Audience = z.infer<typeof audienceSchema>;

const tag = (id: string) => `[MARTHI:${id}]`;

function camp(row: any) {
  return {
    id: row.id,
    provider: row.provider,
    productId: row.product_id,
    variationId: row.variation_id,
    name: row.name,
    objective: row.objective,
    destinationUrl: row.destination_url,
    content: row.content,
    audience: row.audience,
    budgetType: row.budget_type,
    budgetMinor: Number(row.budget_minor),
    currency: row.currency,
    startTime: row.start_time,
    endTime: row.end_time,
    requestedStatus: row.requested_status,
    submitState: row.submit_state,
    submitStep: row.submit_step,
    external: row.external,
    effectiveStatus: row.effective_status,
    reviewFeedback: row.review_feedback,
    issues: row.issues,
    lastError: row.last_error,
    authorizedBy: row.authorized_by,
    authorizedAt: row.authorized_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    lastSyncedAt: row.last_synced_at,
    display: displayState(row),
  };
}

/** Estado mostrado ao lojista: o que o Marthi pediu x o que a Meta informa (effective_status). */
export function displayState(row: any): { key: string; label: string; help: string } {
  if (row.submit_state === 'draft') return { key: 'draft', label: 'Rascunho', help: 'Ainda não foi enviado para a Meta.' };
  if (row.submit_state === 'submitting') return { key: 'pending', label: 'Envio pendente', help: 'O Marthi está criando a campanha na Meta.' };
  if (row.submit_state === 'error') return { key: 'error', label: 'Erro no envio', help: row.last_error || 'Corrija e envie de novo.' };
  const status = String(row.effective_status || '');
  const ended = row.end_time && Date.parse(row.end_time) < Date.now();
  switch (status) {
    case 'PENDING_REVIEW':
      return { key: 'review', label: 'Em análise pela Meta', help: 'A Meta analisa todo anúncio novo antes de veicular.' };
    case 'DISAPPROVED':
      return { key: 'rejected', label: 'Reprovado', help: 'Veja o motivo abaixo, corrija o conteúdo e reenvie.' };
    case 'WITH_ISSUES':
      return { key: 'issues', label: 'Com problemas', help: 'A Meta apontou problemas. Veja os detalhes.' };
    case 'IN_PROCESS':
      return { key: 'processing', label: 'Processando', help: 'A Meta está processando a alteração.' };
    case 'PENDING_BILLING_INFO':
      return { key: 'billing', label: 'Pagamento pendente na Meta', help: 'Cadastre ou regularize a forma de pagamento da conta de anúncios na Meta.' };
    case 'PREAPPROVED':
      return { key: 'review', label: 'Pré-aprovado', help: 'A Meta pré-aprovou; a veiculação começa quando estiver ativo.' };
    case 'ACTIVE':
      return ended ? { key: 'done', label: 'Concluído', help: 'O período da campanha terminou.' } : { key: 'active', label: 'Ativo', help: 'A Meta está veiculando o anúncio.' };
    case 'PAUSED':
    case 'CAMPAIGN_PAUSED':
    case 'ADSET_PAUSED':
      return ended ? { key: 'done', label: 'Concluído', help: 'O período da campanha terminou.' } : { key: 'paused', label: 'Pausado', help: row.requested_status === 'paused' ? 'Criado pausado. Autorize o orçamento para ativar.' : 'Pausado.' };
    case 'ARCHIVED':
    case 'DELETED':
      return { key: 'done', label: 'Encerrado', help: '' };
    default:
      return { key: 'submitted', label: 'Enviado', help: 'Aguardando a primeira atualização da Meta.' };
  }
}

export async function listCampaigns(storeId: string) {
  const rows = (await pool.query('SELECT * FROM ads_campaigns WHERE store_id = $1 ORDER BY created_at DESC LIMIT 200', [storeId])).rows;
  return rows.map(camp);
}

async function load(storeId: string, id: string, lock = false) {
  const row = (await pool.query(`SELECT * FROM ads_campaigns WHERE id = $1 AND store_id = $2${lock ? ' FOR UPDATE' : ''}`, [id, storeId])).rows[0];
  if (!row) throw Object.assign(new Error('Campanha não encontrada nesta loja.'), { status: 404 });
  return row;
}

export async function getCampaign(storeId: string, id: string) {
  const row = await load(storeId, id);
  return { ...camp(row), offer: await publicOffer(pool, storeId, row.product_id, row.variation_id).catch(() => null) };
}

/** Novo rascunho a partir do cadastro: copia os dados públicos (o cadastro não muda). */
export async function createDraft(storeId: string, actor: string, input: { productId: string; variationId?: string | null }) {
  const offer = await publicOffer(pool, storeId, input.productId, input.variationId);
  const copy = defaultAdCopy(offer);
  const connection = await getConnection(pool, storeId);
  const id = `ADS-${randomUUID()}`;
  const content: Content = { headline: copy.headline, message: copy.message, description: copy.description, cta: 'LEARN_MORE', media: { source: 'product', index: 0 } };
  const start = new Date(Date.now() + 3600_000).toISOString();
  await pool.query(
    `INSERT INTO ads_campaigns (id, store_id, provider, product_id, variation_id, name, objective, destination_url, content, audience, budget_type, budget_minor, currency, start_time, created_by)
     VALUES ($1, $2, 'meta', $3, $4, $5, 'traffic', $6, $7::jsonb, $8::jsonb, 'daily', 2000, $9, $10, $11)`,
    [
      id,
      storeId,
      offer.productId,
      offer.variationId,
      offer.title.slice(0, 200),
      offer.url,
      JSON.stringify(content),
      JSON.stringify(audienceSchema.parse({})),
      connection?.ad_account_currency || 'BRL',
      start,
      actor,
    ],
  );
  await audit(pool, storeId, actor, 'campaign.draft_created', id, { productId: offer.productId, variationId: offer.variationId });
  return getCampaign(storeId, id);
}

/** Edição do conteúdo, público, orçamento e período (antes do envio, ou para corrigir e reenviar). */
export async function updateDraft(storeId: string, id: string, actor: string, input: { name?: string; content?: unknown; audience?: unknown; budget?: unknown }) {
  const row = await load(storeId, id);
  if (row.submit_state === 'submitting') throw Object.assign(new Error('Aguarde o envio em andamento terminar.'), { status: 409 });
  const submitted = Boolean(row.external?.ad_id);
  if (submitted && (input.audience || input.budget)) throw Object.assign(new Error('Depois de enviada, só o conteúdo do anúncio pode ser corrigido pelo Marthi.'), { status: 409 });
  const content = input.content ? contentSchema.parse(input.content) : row.content;
  const audience = input.audience ? audienceSchema.parse(input.audience) : row.audience;
  if (audience.ageMax < audience.ageMin) throw Object.assign(new Error('A idade máxima precisa ser maior que a mínima.'), { status: 400 });
  const budget = input.budget ? budgetSchema.parse(input.budget) : null;
  await pool.query(
    `UPDATE ads_campaigns SET name = COALESCE($3, name), content = $4::jsonb, audience = $5::jsonb,
            budget_type = COALESCE($6, budget_type), budget_minor = COALESCE($7, budget_minor), start_time = COALESCE($8::timestamptz, start_time),
            end_time = CASE WHEN $9::boolean THEN $10::timestamptz ELSE end_time END, updated_at = now()
      WHERE id = $1 AND store_id = $2`,
    [id, storeId, input.name?.trim() || null, JSON.stringify(content), JSON.stringify(audience), budget?.budgetType ?? null, budget?.budgetMinor ?? null, budget?.startTime ?? null, Boolean(budget), budget?.endTime ?? null],
  );
  await audit(pool, storeId, actor, 'campaign.edited', id, { submitted });
  return getCampaign(storeId, id);
}

export async function deleteDraft(storeId: string, id: string, actor: string) {
  const row = await load(storeId, id);
  if (row.external?.campaign_id) throw Object.assign(new Error('Esta campanha já existe na Meta: pause em vez de excluir.'), { status: 409 });
  await pool.query('DELETE FROM ads_campaigns WHERE id = $1 AND store_id = $2', [id, storeId]);
  await audit(pool, storeId, actor, 'campaign.draft_deleted', id);
}

/** Bytes da mídia escolhida (foto do produto ou da biblioteca). Vídeo vem como ID já enviado à Meta. */
async function resolveMedia(storeId: string, row: any): Promise<{ kind: 'image'; bytes: Buffer; name: string } | { kind: 'video'; videoId: string; thumbnail: string }> {
  const media = row.content?.media ?? {};
  if (media.source === 'library') {
    const item = (await pool.query('SELECT * FROM ads_media WHERE id = $1 AND store_id = $2', [media.mediaId, storeId])).rows[0];
    if (!item) throw Object.assign(new Error('A mídia escolhida não existe mais. Escolha outra.'), { status: 400 });
    if (item.kind === 'video') {
      if (item.external_status !== 'ready') throw Object.assign(new Error('O vídeo ainda está sendo processado pela Meta. Aguarde e tente de novo.'), { status: 409 });
      return { kind: 'video', videoId: item.external_id, thumbnail: item.thumbnail_url };
    }
    const parsed = dataUrlBytes(item.data_url || '');
    if (!parsed) throw Object.assign(new Error('Imagem da biblioteca inválida.'), { status: 400 });
    return { kind: 'image', bytes: parsed.bytes, name: item.name || 'imagem.jpg' };
  }
  const product = (await pool.query('SELECT images FROM stock_items WHERE id = $1 AND store_id = $2', [row.product_id, storeId])).rows[0];
  const images: string[] = Array.isArray(product?.images) ? product.images : typeof product?.images === 'string' ? JSON.parse(product.images || '[]') : [];
  const src = images[media.index ?? 0];
  if (!src) throw Object.assign(new Error('O produto não tem a foto escolhida. Envie uma foto em Fotos e vídeos.'), { status: 400 });
  const parsed = dataUrlBytes(src);
  if (parsed) return { kind: 'image', bytes: parsed.bytes, name: `produto.${parsed.mime.includes('png') ? 'png' : 'jpg'}` };
  if (!/^https:\/\//.test(src)) throw Object.assign(new Error('Foto do produto em formato não suportado.'), { status: 400 });
  const response = await fetch(src, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw Object.assign(new Error('Não foi possível baixar a foto do produto.'), { status: 400 });
  return { kind: 'image', bytes: Buffer.from(await response.arrayBuffer()), name: src.toLowerCase().includes('.png') ? 'produto.png' : 'produto.jpg' };
}

/** Tudo que impede o envio, em linguagem de lojista (a aprovação final é sempre da Meta). */
export async function validateCampaign(storeId: string, id: string) {
  const row = await load(storeId, id);
  const issues: MediaIssue[] = [];
  const health = await metaHealth(storeId).catch(() => null);
  if (!health?.canAdvertise) issues.push({ level: 'error', message: 'A conta Meta ainda não está pronta para anunciar. Veja Contas conectadas.' });
  const content = contentSchema.safeParse(row.content);
  if (!content.success) issues.push({ level: 'error', message: content.error.issues[0]?.message ?? 'Conteúdo incompleto.' });
  else {
    if (content.data.headline.length > 40) issues.push({ level: 'warning', message: 'Títulos curtos (até 40 caracteres) aparecem inteiros no celular.' });
    if (content.data.message.length > 150) issues.push({ level: 'warning', message: 'A Meta recomenda textos de 50 a 150 caracteres no Feed.' });
  }
  if (!/^https:\/\//.test(row.destination_url)) issues.push({ level: 'error', message: 'O destino precisa ser uma página pública com https.' });
  try {
    const media = await resolveMedia(storeId, row);
    if (media.kind === 'image') issues.push(...checkImage(media.bytes).issues);
  } catch (error) {
    issues.push({ level: 'error', message: (error as Error).message });
  }
  const offer = await publicOffer(pool, storeId, row.product_id, row.variation_id).catch((error) => {
    issues.push({ level: 'error', message: (error as Error).message });
    return null;
  });
  if (offer && !offer.available) issues.push({ level: 'warning', message: 'O produto está sem estoque e sem encomenda: quem clicar vai ver "indisponível".' });
  if (row.end_time && Date.parse(row.end_time) < Date.now()) issues.push({ level: 'error', message: 'O período já terminou. Ajuste as datas.' });
  if (Number(row.budget_minor) <= 0) issues.push({ level: 'error', message: 'Informe o orçamento.' });
  return { issues, canSubmit: !issues.some((issue) => issue.level === 'error') };
}

/** Procura na conta um objeto criado numa tentativa anterior (marca do Marthi no nome). */
async function reconcile(token: string, accountId: string, edge: 'campaigns' | 'adsets' | 'adcreatives' | 'ads', marker: string) {
  const result: any = await graph('GET', `${accountId}/${edge}`, {
    token,
    params: { fields: 'id,name', filtering: [{ field: 'name', operator: 'CONTAIN', value: marker }], limit: 5 },
  });
  return (result?.data ?? [])[0]?.id ? String(result.data[0].id) : null;
}

async function saveStep(id: string, step: string, patch: Record<string, string>) {
  await pool.query(`UPDATE ads_campaigns SET submit_step = $2, external = external || $3::jsonb, updated_at = now() WHERE id = $1`, [id, step, JSON.stringify(patch)]);
}

/**
 * Envio para a Meta: campanha → conjunto → criativo → anúncio, todos PAUSADOS. Cada ID é gravado
 * assim que criado; numa nova tentativa, o que já existe é reaproveitado e o que ficou sem resposta
 * (timeout) é procurado pela marca do Marthi antes de recriar. Uma trava impede envio em paralelo.
 */
export async function submitCampaign(storeId: string, id: string, actor: string, input: { confirm: boolean; submitKey: string }) {
  if (!input.confirm) throw Object.assign(new Error('Confirme o envio para a Meta.'), { status: 400 });
  // Mesma chave de envio já usada: devolve o resultado em vez de enviar de novo.
  const sameKey = (await pool.query('SELECT id FROM ads_campaigns WHERE store_id = $1 AND submit_key = $2', [storeId, input.submitKey])).rows[0];
  if (sameKey && sameKey.id !== id) throw Object.assign(new Error('Esta confirmação já foi usada em outra campanha.'), { status: 409 });
  if (sameKey) {
    const current = await load(storeId, id);
    if (current.submit_state !== 'error') return getCampaign(storeId, id);
  }
  const validation = await validateCampaign(storeId, id);
  if (!validation.canSubmit) throw Object.assign(new Error(validation.issues.find((issue) => issue.level === 'error')?.message ?? 'Corrija os problemas antes de enviar.'), { status: 400 });
  const claimed = (
    await pool.query(
      `UPDATE ads_campaigns SET submit_state = 'submitting', submit_key = $3, last_error = '', updated_at = now()
        WHERE id = $1 AND store_id = $2 AND submit_state IN ('draft', 'error') RETURNING *`,
      [id, storeId, input.submitKey],
    )
  ).rows[0];
  if (!claimed) throw Object.assign(new Error('Esta campanha já foi enviada ou está sendo enviada.'), { status: 409 });
  await audit(pool, storeId, actor, 'campaign.submit_started', id);

  const { connection, token } = await userToken(storeId);
  const account = connection.ad_account_id as string;
  const marker = tag(id);
  const ext: Record<string, string> = { ...(claimed.external ?? {}) };
  const resumedStep = String(claimed.submit_step || '');
  // Etapa que ficou sem resposta na tentativa anterior: concilia antes de criar de novo.
  const createOrReconcile = async (step: string, edge: 'campaigns' | 'adsets' | 'adcreatives' | 'ads', key: string, create: () => Promise<any>) => {
    if (ext[key]) return ext[key];
    if (resumedStep === step) {
      const found = await reconcile(token, account, edge, marker);
      if (found) {
        ext[key] = found;
        await saveStep(id, step, { [key]: found });
        return found;
      }
    }
    await saveStep(id, step, {});
    const created = await create();
    ext[key] = String(created.id);
    await saveStep(id, `${step}_done`, { [key]: ext[key] });
    return ext[key];
  };

  try {
    const media = await resolveMedia(storeId, claimed);
    if (media.kind === 'image' && !ext.image_hash) {
      const uploaded: any = await graph('POST', `${account}/adimages`, { token, params: { bytes: media.bytes.toString('base64'), name: media.name } });
      const first: any = Object.values(uploaded?.images ?? {})[0];
      if (!first?.hash) throw new Error('A Meta não devolveu a identificação da imagem enviada.');
      ext.image_hash = String(first.hash);
      await saveStep(id, 'image_done', { image_hash: ext.image_hash });
    }
    const content: Content = claimed.content;
    const audience: Audience = audienceSchema.parse(claimed.audience ?? {});
    await createOrReconcile('campaign', 'campaigns', 'campaign_id', () =>
      graph('POST', `${account}/campaigns`, {
        token,
        params: { name: `${claimed.name.slice(0, 180)} ${marker}`, objective: 'OUTCOME_TRAFFIC', status: 'PAUSED', special_ad_categories: [] },
      }),
    );
    const geo = audience.cities.length ? { cities: audience.cities.map((city) => ({ key: city.key })) } : { countries: audience.countries };
    await createOrReconcile('adset', 'adsets', 'adset_id', () =>
      graph('POST', `${account}/adsets`, {
        token,
        params: {
          name: `Conjunto ${marker}`,
          campaign_id: ext.campaign_id,
          [claimed.budget_type === 'lifetime' ? 'lifetime_budget' : 'daily_budget']: Number(claimed.budget_minor),
          start_time: new Date(claimed.start_time).toISOString(),
          ...(claimed.end_time ? { end_time: new Date(claimed.end_time).toISOString() } : {}),
          billing_event: 'IMPRESSIONS',
          optimization_goal: 'LINK_CLICKS',
          bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
          destination_type: 'WEBSITE',
          targeting: {
            geo_locations: geo,
            age_min: audience.ageMin,
            age_max: audience.ageMax,
            publisher_platforms: ['facebook'],
            facebook_positions: ['feed'],
            targeting_automation: { advantage_audience: 0 },
          },
          status: 'PAUSED',
        },
      }),
    );
    await createOrReconcile('creative', 'adcreatives', 'creative_id', () =>
      graph('POST', `${account}/adcreatives`, { token, params: { name: `Criativo ${marker}`, object_story_spec: storySpec(connection.page_id, claimed.destination_url, content, media, ext.image_hash ?? '') } }),
    );
    await createOrReconcile('ad', 'ads', 'ad_id', () =>
      graph('POST', `${account}/ads`, { token, params: { name: `Anúncio ${marker}`, adset_id: ext.adset_id, creative: { creative_id: ext.creative_id }, status: 'PAUSED' } }),
    );
    await pool.query(
      `UPDATE ads_campaigns SET submit_state = 'submitted', submit_step = 'done', requested_status = 'paused', external = $3::jsonb, last_error = '', updated_at = now() WHERE id = $1 AND store_id = $2`,
      [id, storeId, JSON.stringify(ext)],
    );
    await audit(pool, storeId, actor, 'campaign.submitted', id, ext);
    await syncCampaign(storeId, id).catch(() => undefined);
    return getCampaign(storeId, id);
  } catch (error) {
    await markNeedsReconnect(storeId, error);
    const message = error instanceof MetaTimeoutError ? `${explainMetaError(error)} Clique em "Enviar" de novo — nada será duplicado.` : explainMetaError(error);
    await pool.query(`UPDATE ads_campaigns SET submit_state = 'error', last_error = $3, external = $4::jsonb, updated_at = now() WHERE id = $1 AND store_id = $2`, [id, storeId, message, JSON.stringify(ext)]);
    await audit(pool, storeId, actor, 'campaign.submit_failed', id, { error: message, code: error instanceof MetaApiError ? error.code : null, step: ext });
    // 409: resultado incerto (timeout) — repetir é seguro; 424: falha do lado da Meta; 422: a Meta recusou os dados.
    const status = error instanceof MetaTimeoutError ? 409 : error instanceof MetaApiError && error.httpStatus < 500 ? 422 : 424;
    throw Object.assign(new Error(message), { status });
  }
}

function storySpec(pageId: string, link: string, content: Content, media: Awaited<ReturnType<typeof resolveMedia>>, imageHash: string) {
  const cta = { type: content.cta, value: { link } };
  if (media.kind === 'video') {
    return { page_id: pageId, video_data: { video_id: media.videoId, image_url: media.thumbnail || undefined, title: content.headline, message: content.message, call_to_action: cta } };
  }
  return { page_id: pageId, link_data: { link, message: content.message, name: content.headline, description: content.description || undefined, image_hash: imageHash, call_to_action: cta } };
}

/** Corrigir e reenviar: novo criativo com o conteúdo atual, ligado ao mesmo anúncio (volta para análise). */
export async function resubmitCreative(storeId: string, id: string, actor: string) {
  const row = await load(storeId, id);
  if (!row.external?.ad_id) throw Object.assign(new Error('A campanha ainda não foi enviada.'), { status: 409 });
  const { connection, token } = await userToken(storeId);
  try {
    const media = await resolveMedia(storeId, row);
    let imageHash = '';
    if (media.kind === 'image') {
      const uploaded: any = await graph('POST', `${connection.ad_account_id}/adimages`, { token, params: { bytes: media.bytes.toString('base64'), name: media.name } });
      imageHash = String((Object.values(uploaded?.images ?? {})[0] as any)?.hash ?? '');
    }
    const spec = storySpec(connection.page_id, row.destination_url, row.content, media, imageHash);
    const creative: any = await graph('POST', `${connection.ad_account_id}/adcreatives`, { token, params: { name: `Criativo ${tag(id)} ${Date.now()}`, object_story_spec: spec } });
    await graph('POST', row.external.ad_id, { token, params: { creative: { creative_id: String(creative.id) } } });
    await pool.query(`UPDATE ads_campaigns SET external = external || $3::jsonb, updated_at = now() WHERE id = $1 AND store_id = $2`, [id, storeId, JSON.stringify({ creative_id: String(creative.id), image_hash: imageHash })]);
    await audit(pool, storeId, actor, 'campaign.creative_resubmitted', id, { creativeId: String(creative.id) });
  } catch (error) {
    await markNeedsReconnect(storeId, error);
    throw Object.assign(new Error(explainMetaError(error)), { status: 422 });
  }
  await syncCampaign(storeId, id).catch(() => undefined);
  return getCampaign(storeId, id);
}

/** Muda o status pedido nos três níveis (campanha, conjunto, anúncio). */
async function setStatus(storeId: string, id: string, status: 'ACTIVE' | 'PAUSED') {
  const row = await load(storeId, id);
  if (row.submit_state !== 'submitted' || !row.external?.ad_id) throw Object.assign(new Error('Envie a campanha para a Meta antes.'), { status: 409 });
  const { token } = await userToken(storeId);
  try {
    const order = status === 'ACTIVE' ? ['ad_id', 'adset_id', 'campaign_id'] : ['campaign_id'];
    for (const key of order) await graph('POST', row.external[key], { token, params: { status } });
  } catch (error) {
    await markNeedsReconnect(storeId, error);
    throw Object.assign(new Error(explainMetaError(error)), { status: 422 });
  }
  return row;
}

/** Ativar = autorizar o gasto. Só com confirmação explícita, conta pronta e dentro do período. */
export async function activateCampaign(storeId: string, id: string, actor: string, input: { confirm: boolean; acknowledgedBudgetMinor: number }) {
  const row = await load(storeId, id);
  if (!input.confirm) throw Object.assign(new Error('Confirme a autorização do orçamento.'), { status: 400 });
  if (Number(input.acknowledgedBudgetMinor) !== Number(row.budget_minor)) throw Object.assign(new Error('O orçamento mudou. Confira o valor e autorize de novo.'), { status: 409 });
  if (row.end_time && Date.parse(row.end_time) < Date.now()) throw Object.assign(new Error('O período da campanha já terminou.'), { status: 409 });
  const health = await metaHealth(storeId);
  if (!health.canAdvertise) throw Object.assign(new Error('A conta Meta não está pronta para anunciar. Veja Contas conectadas.'), { status: 409 });
  await setStatus(storeId, id, 'ACTIVE');
  await pool.query(`UPDATE ads_campaigns SET requested_status = 'active', authorized_by = $3, authorized_at = now(), updated_at = now() WHERE id = $1 AND store_id = $2`, [id, storeId, actor]);
  await audit(pool, storeId, actor, 'campaign.activated', id, { budgetMinor: Number(row.budget_minor), budgetType: row.budget_type, currency: row.currency });
  await syncCampaign(storeId, id).catch(() => undefined);
  return getCampaign(storeId, id);
}

export async function pauseCampaign(storeId: string, id: string, actor: string) {
  await setStatus(storeId, id, 'PAUSED');
  await pool.query(`UPDATE ads_campaigns SET requested_status = 'paused', updated_at = now() WHERE id = $1 AND store_id = $2`, [id, storeId]);
  await audit(pool, storeId, actor, 'campaign.paused', id);
  await syncCampaign(storeId, id).catch(() => undefined);
  return getCampaign(storeId, id);
}

/** Estado efetivo na Meta (anúncio, conjunto e campanha) e motivo de reprovação quando houver. */
export async function syncCampaign(storeId: string, id: string) {
  const row = await load(storeId, id);
  if (!row.external?.ad_id) return getCampaign(storeId, id);
  const { token } = await userToken(storeId);
  try {
    const ad: any = await graph('GET', row.external.ad_id, { token, params: { fields: 'status,configured_status,effective_status,ad_review_feedback,issues_info' } });
    const campaign: any = await graph('GET', row.external.campaign_id, { token, params: { fields: 'effective_status' } });
    // Campanha ou conjunto pausados mandam no anúncio.
    let effective = String(ad.effective_status ?? '');
    if (['PAUSED', 'CAMPAIGN_PAUSED'].includes(String(campaign.effective_status)) && !['DISAPPROVED', 'PENDING_REVIEW', 'WITH_ISSUES'].includes(effective)) effective = 'CAMPAIGN_PAUSED';
    await pool.query(
      `UPDATE ads_campaigns SET effective_status = $3, review_feedback = $4::jsonb, issues = $5::jsonb, last_synced_at = now(), updated_at = now() WHERE id = $1 AND store_id = $2`,
      [id, storeId, effective, JSON.stringify(ad.ad_review_feedback ?? null), JSON.stringify(ad.issues_info ?? null)],
    );
  } catch (error) {
    await markNeedsReconnect(storeId, error);
    throw Object.assign(new Error(explainMetaError(error)), { status: 422 });
  }
  return getCampaign(storeId, id);
}

const INSIGHT_FIELDS = 'spend,impressions,reach,clicks,inline_link_clicks,ctr,cpc,cpm,frequency,date_start,date_stop';
export const INSIGHT_PRESETS = ['today', 'yesterday', 'last_7d', 'last_30d', 'maximum'] as const;

/**
 * Resultados da Meta. `data: null` = a Meta ainda não tem dados (diferente de zero). Sem rastreamento
 * de conversão, o Marthi não mostra conversões nem retorno sobre investimento.
 */
export async function campaignInsights(storeId: string, id: string, preset: (typeof INSIGHT_PRESETS)[number]) {
  const row = await load(storeId, id);
  if (!row.external?.campaign_id) return { preset, data: null, fetchedAt: null, currency: row.currency, conversionsTracked: false };
  const { token } = await userToken(storeId);
  let data: any = null;
  try {
    const result: any = await graph('GET', `${row.external.campaign_id}/insights`, { token, params: { fields: INSIGHT_FIELDS, date_preset: preset } });
    data = (result?.data ?? [])[0] ?? null;
  } catch (error) {
    await markNeedsReconnect(storeId, error);
    throw Object.assign(new Error(explainMetaError(error)), { status: 422 });
  }
  const fetched = (
    await pool.query(
      `INSERT INTO ads_insights (campaign_id, date_preset, data, fetched_at) VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (campaign_id, date_preset) DO UPDATE SET data = EXCLUDED.data, fetched_at = now() RETURNING fetched_at`,
      [id, preset, JSON.stringify(data)],
    )
  ).rows[0];
  return { preset, data, fetchedAt: fetched.fetched_at, currency: row.currency, conversionsTracked: false };
}

/** Busca de cidades para o público (Targeting Search oficial: type=adgeolocation). */
export async function searchCities(storeId: string, q: string) {
  const { token } = await userToken(storeId);
  const result: any = await graph('GET', 'search', { token, params: { type: 'adgeolocation', location_types: ['city'], q, country_code: 'BR', limit: 10 } });
  return (result?.data ?? []).map((item: any) => ({ key: String(item.key), name: `${item.name}${item.region ? ` - ${item.region}` : ''}` }));
}

let timer: NodeJS.Timeout | null = null;
/** Atualiza estado e resultados das campanhas enviadas (a cada 15 min; a Meta não avisa por webhook neste fluxo). */
export function startAdsSyncWorker() {
  if (timer) return;
  const tick = async () => {
    const rows = (
      await pool.query(
        `SELECT id, store_id FROM ads_campaigns WHERE submit_state = 'submitted' AND updated_at > now() - interval '90 days'
           AND (last_synced_at IS NULL OR last_synced_at < now() - interval '14 minutes') ORDER BY last_synced_at NULLS FIRST LIMIT 50`,
      )
    ).rows;
    for (const row of rows) {
      await syncCampaign(row.store_id, row.id).catch(() => undefined);
      await campaignInsights(row.store_id, row.id, 'maximum').catch(() => undefined);
    }
  };
  timer = setInterval(() => void tick().catch((error) => console.error('[ads] Falha ao sincronizar campanhas:', error)), 15 * 60 * 1000);
}
