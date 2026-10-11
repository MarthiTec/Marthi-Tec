import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { pool } from '../../db/pool.js';
import { graph, graphList, META_GRAPH_VERSION, MetaApiError } from './metaGraph.js';
import { openToken, sealToken, vaultReady } from './tokenVault.js';

type Db = { query: (sql: string, args?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }> };

/** Permissões da Fase 1 (Facebook): só o necessário para criar e acompanhar anúncios da Página. */
export const META_PHASE1_SCOPES = ['ads_management', 'ads_read', 'pages_show_list', 'pages_read_engagement', 'pages_manage_ads'] as const;

const PERMISSION_HELP: Record<string, string> = {
  ads_management: 'criar, pausar e retomar campanhas',
  ads_read: 'ler os resultados (gasto, alcance, cliques)',
  pages_show_list: 'listar as suas Páginas do Facebook',
  pages_read_engagement: 'ler os dados da Página usada no anúncio',
  pages_manage_ads: 'anunciar usando a sua Página como identidade',
};

/** Situação da conta de anúncios (account_status) em linguagem de lojista. */
const ACCOUNT_STATUS: Record<number, { label: string; help: string }> = {
  1: { label: 'Ativa', help: '' },
  2: { label: 'Desativada', help: 'A Meta desativou a conta. No Gerenciador de Anúncios, veja o motivo e peça uma análise.' },
  3: { label: 'Pagamento pendente', help: 'Há um pagamento em aberto na Meta. Quite o saldo em Cobrança e pagamentos do Gerenciador de Anúncios.' },
  7: { label: 'Em análise de risco', help: 'A Meta está analisando a conta. Aguarde a conclusão para anunciar.' },
  8: { label: 'Liquidação pendente', help: 'A Meta aguarda a liquidação de valores. Confira Cobrança e pagamentos.' },
  9: { label: 'Período de carência', help: 'Há uma pendência de pagamento em carência. Regularize em Cobrança e pagamentos.' },
  100: { label: 'Encerramento pendente', help: 'A conta está sendo encerrada. Use outra conta de anúncios.' },
  101: { label: 'Encerrada', help: 'A conta foi encerrada. Use outra conta de anúncios.' },
};

export function metaConfig() {
  const appConfigured = Boolean(env.META_APP_ID && env.META_APP_SECRET);
  return {
    appConfigured,
    vaultReady: vaultReady(),
    loginMode: env.META_LOGIN_CONFIG_ID ? 'business_config' : 'scope',
    apiVersion: META_GRAPH_VERSION,
    environment: env.ADS_ENVIRONMENT,
    redirectUri: redirectUri(),
    scopes: [...META_PHASE1_SCOPES],
  };
}

function redirectUri() {
  const base = (env.PUBLIC_API_URL || env.FRONTEND_URL).replace(/\/$/, '');
  return `${base}/api/v1/ads/meta/callback`;
}

function requireConfigured() {
  const config = metaConfig();
  if (!config.appConfigured) throw Object.assign(new Error('A integração com a Meta ainda não foi configurada no servidor do Marthi (app Meta). Fale com o suporte.'), { status: 503 });
  if (!config.vaultReady) throw Object.assign(new Error('A chave de proteção dos tokens não está configurada no servidor. Fale com o suporte.'), { status: 503 });
}

export async function audit(db: Db, storeId: string, actor: string, action: string, entityId = '', details: Record<string, unknown> = {}) {
  await db.query('INSERT INTO ads_audit (id, store_id, actor, action, entity_id, details) VALUES ($1, $2, $3, $4, $5, $6::jsonb)', [
    `AUD-${randomUUID()}`,
    storeId,
    actor,
    action,
    entityId,
    JSON.stringify(details),
  ]);
}

/** Endereço oficial de login da Meta, com `state` de uso único preso à loja (10 minutos). */
export async function startMetaConnect(storeId: string, user: { id: string; name: string }) {
  requireConfigured();
  const state = randomBytes(24).toString('hex');
  await pool.query(
    `INSERT INTO ads_oauth_states (state, store_id, provider, user_id, user_name, expires_at) VALUES ($1, $2, 'meta', $3, $4, now() + interval '10 minutes')`,
    [state, storeId, user.id, user.name],
  );
  const url = new URL(`https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set('client_id', env.META_APP_ID!);
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('state', state);
  url.searchParams.set('response_type', 'code');
  if (env.META_LOGIN_CONFIG_ID) url.searchParams.set('config_id', env.META_LOGIN_CONFIG_ID);
  else url.searchParams.set('scope', META_PHASE1_SCOPES.join(','));
  return { url: url.toString() };
}

/** Retorno do login: confere o `state`, troca o código no servidor e guarda o token criptografado. */
export async function finishMetaConnect(query: { code?: string; state?: string; error?: string; error_description?: string }) {
  if (!query.state) throw Object.assign(new Error('Retorno da Meta sem identificação do pedido.'), { status: 400 });
  const claimed = (
    await pool.query(
      `UPDATE ads_oauth_states SET used_at = now() WHERE state = $1 AND provider = 'meta' AND used_at IS NULL AND expires_at > now() RETURNING store_id, user_name`,
      [query.state],
    )
  ).rows[0];
  if (!claimed) throw Object.assign(new Error('Pedido de conexão inválido ou expirado. Comece a conexão de novo pelo Marthi.'), { status: 400 });
  const storeId: string = claimed.store_id;
  if (query.error || !query.code) {
    await audit(pool, storeId, claimed.user_name, 'meta.connect_denied', '', { error: query.error ?? 'sem código', description: query.error_description ?? '' });
    return { storeId, ok: false as const, reason: query.error_description || 'A conexão foi cancelada na Meta.' };
  }
  requireConfigured();
  const short: any = await graph('GET', 'oauth/access_token', {
    params: { client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET, redirect_uri: redirectUri(), code: query.code },
  });
  // Token de longa duração (~60 dias) — sempre no servidor, com o segredo do app.
  const long: any = await graph('GET', 'oauth/access_token', {
    params: { grant_type: 'fb_exchange_token', client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET, fb_exchange_token: short.access_token },
  });
  const token: string = long.access_token || short.access_token;
  const expiresIn = Number(long.expires_in || short.expires_in || 0);
  const me: any = await graph('GET', 'me', { token, params: { fields: 'id,name' } });
  const granted = await grantedScopes(token);
  await pool.query(
    `INSERT INTO ads_connections (id, store_id, provider, status, external_user_id, external_user_name, token_enc, token_expires_at, scopes, connected_by, last_error, last_checked_at)
     VALUES ($1, $2, 'meta', 'connected', $3, $4, $5, $6, $7::jsonb, $8, '', now())
     ON CONFLICT (store_id, provider) DO UPDATE SET status = 'connected', external_user_id = EXCLUDED.external_user_id, external_user_name = EXCLUDED.external_user_name,
       token_enc = EXCLUDED.token_enc, token_expires_at = EXCLUDED.token_expires_at, scopes = EXCLUDED.scopes, connected_by = EXCLUDED.connected_by,
       last_error = '', last_checked_at = now(), updated_at = now(),
       -- Outra pessoa conectou: os ativos escolhidos antes podem não ser dela.
       page_id = CASE WHEN ads_connections.external_user_id = EXCLUDED.external_user_id THEN ads_connections.page_id ELSE NULL END,
       page_token_enc = CASE WHEN ads_connections.external_user_id = EXCLUDED.external_user_id THEN ads_connections.page_token_enc ELSE NULL END,
       ad_account_id = CASE WHEN ads_connections.external_user_id = EXCLUDED.external_user_id THEN ads_connections.ad_account_id ELSE NULL END`,
    [
      `CON-${randomUUID()}`,
      storeId,
      String(me.id),
      String(me.name ?? ''),
      sealToken(token),
      expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null,
      JSON.stringify(granted),
      claimed.user_name,
    ],
  );
  await audit(pool, storeId, claimed.user_name, 'meta.connected', String(me.id), { scopes: granted });
  return { storeId, ok: true as const };
}

async function grantedScopes(token: string) {
  const list: any[] = await graphList('me/permissions', { token });
  return list.filter((item) => item.status === 'granted').map((item) => String(item.permission));
}

export async function getConnection(db: Db, storeId: string) {
  return (await db.query(`SELECT * FROM ads_connections WHERE store_id = $1 AND provider = 'meta'`, [storeId])).rows[0] ?? null;
}

/** Token do usuário (descriptografado só aqui, no servidor). */
export async function userToken(storeId: string) {
  const connection = await getConnection(pool, storeId);
  if (!connection || connection.status === 'revoked' || !connection.token_enc) throw Object.assign(new Error('Conecte a conta Meta em Contas conectadas.'), { status: 409 });
  if (connection.status === 'needs_reconnect') throw Object.assign(new Error('A conexão com a Meta expirou. Conecte de novo em Contas conectadas.'), { status: 409 });
  return { connection, token: openToken(connection.token_enc) };
}

/** Token expirado/revogado: a conexão passa a pedir reconexão (nada é dado como enviado). */
export async function markNeedsReconnect(storeId: string, error: unknown) {
  if (error instanceof MetaApiError && error.isAuth) {
    await pool.query(`UPDATE ads_connections SET status = 'needs_reconnect', last_error = $2, updated_at = now() WHERE store_id = $1 AND provider = 'meta'`, [storeId, error.message]);
  }
}

/** Páginas e contas de anúncio que a pessoa autorizou (sem expor tokens ao navegador). */
export async function listMetaAssets(storeId: string) {
  const { token } = await userToken(storeId);
  try {
    const pages: any[] = await graphList('me/accounts', { token, params: { fields: 'id,name,tasks,instagram_business_account{id,username}' } });
    const accounts: any[] = await graphList('me/adaccounts', {
      token,
      params: { fields: 'id,account_id,name,account_status,disable_reason,currency,timezone_name' },
    });
    return {
      pages: pages.map((page) => ({
        id: String(page.id),
        name: String(page.name ?? ''),
        canAdvertise: Array.isArray(page.tasks) ? page.tasks.includes('ADVERTISE') : false,
        instagram: page.instagram_business_account ? { id: String(page.instagram_business_account.id), username: String(page.instagram_business_account.username ?? '') } : null,
      })),
      adAccounts: accounts.map((account) => ({
        id: String(account.id),
        name: String(account.name ?? account.account_id ?? ''),
        status: Number(account.account_status),
        statusLabel: ACCOUNT_STATUS[Number(account.account_status)]?.label ?? `Situação ${account.account_status}`,
        currency: String(account.currency ?? ''),
        timezone: String(account.timezone_name ?? ''),
      })),
    };
  } catch (error) {
    await markNeedsReconnect(storeId, error);
    throw error;
  }
}

/** Escolha da Página e da conta de anúncios (conferidas na Meta, não no que o navegador mandou). */
export async function selectMetaAssets(storeId: string, input: { pageId: string; adAccountId: string }, actor: string) {
  const { token } = await userToken(storeId);
  const pages: any[] = await graphList('me/accounts', { token, params: { fields: 'id,name,tasks,access_token,instagram_business_account{id,username}' } });
  const page = pages.find((item) => String(item.id) === input.pageId);
  if (!page) throw Object.assign(new Error('Essa Página não está entre as que você autorizou na Meta.'), { status: 400 });
  if (!Array.isArray(page.tasks) || !page.tasks.includes('ADVERTISE')) throw Object.assign(new Error('Você não tem permissão de anunciar por essa Página. Peça a um administrador da Página.'), { status: 400 });
  const accounts: any[] = await graphList('me/adaccounts', { token, params: { fields: 'id,name,account_status,currency,timezone_name' } });
  const account = accounts.find((item) => String(item.id) === input.adAccountId);
  if (!account) throw Object.assign(new Error('Essa conta de anúncios não está entre as que você autorizou na Meta.'), { status: 400 });
  await pool.query(
    `UPDATE ads_connections SET page_id = $2, page_name = $3, page_token_enc = $4, ad_account_id = $5, ad_account_name = $6, ad_account_currency = $7, ad_account_timezone = $8,
            ad_account_status = $9, instagram_id = $10, instagram_username = $11, updated_at = now()
      WHERE store_id = $1 AND provider = 'meta'`,
    [
      storeId,
      String(page.id),
      String(page.name ?? ''),
      page.access_token ? sealToken(String(page.access_token)) : null,
      String(account.id),
      String(account.name ?? ''),
      String(account.currency ?? ''),
      String(account.timezone_name ?? ''),
      Number(account.account_status),
      page.instagram_business_account ? String(page.instagram_business_account.id) : null,
      page.instagram_business_account ? String(page.instagram_business_account.username ?? '') : '',
    ],
  );
  await audit(pool, storeId, actor, 'meta.assets_selected', String(page.id), { adAccountId: String(account.id) });
}

export type HealthCheck = { id: string; ok: boolean; title: string; help: string };

/** Confere tudo que é preciso para anunciar e diz como resolver cada impedimento. */
export async function metaHealth(storeId: string) {
  const config = metaConfig();
  const checks: HealthCheck[] = [];
  checks.push({
    id: 'app',
    ok: config.appConfigured && config.vaultReady,
    title: 'Integração Meta configurada no Marthi',
    help: config.appConfigured && config.vaultReady ? '' : 'O app Meta do Marthi ainda não está configurado neste servidor. Fale com o suporte do Marthi.',
  });
  const connection = await getConnection(pool, storeId);
  if (!connection || connection.status === 'revoked' || !connection.token_enc) {
    checks.push({ id: 'connection', ok: false, title: 'Conta Meta conectada', help: 'Clique em "Conectar com a Meta" e entre com a sua conta do Facebook (o Marthi nunca pede a sua senha).' });
    return { connection: publicConnection(connection), checks, canAdvertise: false };
  }
  let granted: string[] = Array.isArray(connection.scopes) ? connection.scopes : [];
  let tokenOk = connection.status !== 'needs_reconnect';
  let account: any = null;
  if (tokenOk && config.appConfigured && config.vaultReady) {
    try {
      const token = openToken(connection.token_enc);
      granted = await grantedScopes(token);
      if (connection.ad_account_id) {
        account = await graph('GET', connection.ad_account_id, { token, params: { fields: 'id,name,account_status,disable_reason,currency' } });
      }
      await pool.query(
        `UPDATE ads_connections SET scopes = $2::jsonb, ad_account_status = COALESCE($3, ad_account_status), status = 'connected', last_error = '', last_checked_at = now() WHERE id = $1`,
        [connection.id, JSON.stringify(granted), account ? Number(account.account_status) : null],
      );
    } catch (error) {
      if (error instanceof MetaApiError && error.isAuth) {
        tokenOk = false;
        await markNeedsReconnect(storeId, error);
      } else throw error;
    }
  }
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at) : null;
  checks.push({
    id: 'connection',
    ok: tokenOk,
    title: `Conta Meta conectada${connection.external_user_name ? ` (${connection.external_user_name})` : ''}`,
    help: tokenOk
      ? expiresAt && expiresAt.getTime() - Date.now() < 7 * 86400_000
        ? `A autorização vence em ${expiresAt.toLocaleDateString('pt-BR')}. Conecte de novo antes disso.`
        : ''
      : 'A autorização expirou ou foi removida no Facebook. Clique em "Conectar com a Meta" de novo.',
  });
  const missing = META_PHASE1_SCOPES.filter((scope) => !granted.includes(scope));
  checks.push({
    id: 'permissions',
    ok: tokenOk && missing.length === 0,
    title: 'Permissões concedidas',
    help: missing.length ? `Faltam permissões: ${missing.map((scope) => `${scope} (${PERMISSION_HELP[scope]})`).join('; ')}. Conecte de novo e marque todas.` : '',
  });
  checks.push({
    id: 'page',
    ok: Boolean(connection.page_id),
    title: connection.page_id ? `Página: ${connection.page_name}` : 'Página do Facebook escolhida',
    help: connection.page_id ? '' : 'Escolha a Página do Facebook que vai aparecer como autora do anúncio.',
  });
  const status = account ? Number(account.account_status) : connection.ad_account_status != null ? Number(connection.ad_account_status) : null;
  const info = status != null ? ACCOUNT_STATUS[status] : undefined;
  checks.push({
    id: 'ad_account',
    ok: Boolean(connection.ad_account_id) && status === 1,
    title: connection.ad_account_id ? `Conta de anúncios: ${connection.ad_account_name} — ${info?.label ?? 'situação desconhecida'}` : 'Conta de anúncios escolhida',
    help: !connection.ad_account_id
      ? 'Escolha a conta de anúncios que vai pagar e rodar as campanhas.'
      : status === 1
        ? 'A Meta cobra o anúncio direto nesta conta, pela forma de pagamento cadastrada nela.'
        : info?.help || 'Confira a situação da conta no Gerenciador de Anúncios da Meta.',
  });
  checks.push({
    id: 'instagram',
    ok: Boolean(connection.instagram_id),
    title: connection.instagram_id ? `Instagram profissional: @${connection.instagram_username}` : 'Instagram profissional (Fase 3)',
    help: connection.instagram_id ? 'Identificado. Anúncios e publicações no Instagram chegam na Fase 3.' : 'Nenhum Instagram profissional ligado a esta Página. Não impede anunciar no Facebook.',
  });
  const blocking = checks.filter((check) => check.id !== 'instagram');
  const fresh = await getConnection(pool, storeId);
  return { connection: publicConnection(fresh), checks, canAdvertise: blocking.every((check) => check.ok) };
}

/** Dados da conexão que podem ir para a tela (nunca tokens). */
export function publicConnection(row: any) {
  if (!row) return null;
  return {
    status: row.status,
    userName: row.external_user_name,
    expiresAt: row.token_expires_at,
    scopes: row.scopes ?? [],
    page: row.page_id ? { id: row.page_id, name: row.page_name } : null,
    adAccount: row.ad_account_id ? { id: row.ad_account_id, name: row.ad_account_name, currency: row.ad_account_currency, timezone: row.ad_account_timezone, status: row.ad_account_status } : null,
    instagram: row.instagram_id ? { id: row.instagram_id, username: row.instagram_username } : null,
    lastCheckedAt: row.last_checked_at,
    connectedBy: row.connected_by,
  };
}

/** Desconectar: revoga na Meta (melhor esforço) e apaga os tokens guardados. */
export async function disconnectMeta(storeId: string, actor: string) {
  const connection = await getConnection(pool, storeId);
  if (!connection) return;
  let revoked = false;
  if (connection.token_enc && metaConfig().vaultReady) {
    try {
      await graph('DELETE', 'me/permissions', { token: openToken(connection.token_enc) });
      revoked = true;
    } catch {
      revoked = false;
    }
  }
  await pool.query(`UPDATE ads_connections SET status = 'revoked', token_enc = NULL, page_token_enc = NULL, token_expires_at = NULL, updated_at = now() WHERE id = $1`, [connection.id]);
  await audit(pool, storeId, actor, 'meta.disconnected', connection.external_user_id, { revokedAtMeta: revoked });
}

/** Callback oficial de exclusão de dados (signed_request assinado com o segredo do app). */
export async function handleDataDeletion(signedRequest: string) {
  if (!env.META_APP_SECRET) throw Object.assign(new Error('App Meta não configurado.'), { status: 503 });
  const [encodedSig, payload] = String(signedRequest || '').split('.', 2);
  if (!encodedSig || !payload) throw Object.assign(new Error('signed_request inválido.'), { status: 400 });
  const decode = (value: string) => Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const expected = createHmac('sha256', env.META_APP_SECRET).update(payload).digest();
  const received = decode(encodedSig);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw Object.assign(new Error('Assinatura inválida.'), { status: 400 });
  const data = JSON.parse(decode(payload).toString('utf8'));
  const userId = String(data.user_id ?? '');
  if (!userId) throw Object.assign(new Error('Usuário não informado.'), { status: 400 });
  const affected = await pool.query(
    `UPDATE ads_connections SET status = 'revoked', token_enc = NULL, page_token_enc = NULL, external_user_name = '', token_expires_at = NULL, updated_at = now()
      WHERE provider = 'meta' AND external_user_id = $1 RETURNING store_id`,
    [userId],
  );
  const code = randomBytes(8).toString('hex');
  await pool.query(`INSERT INTO ads_data_deletions (confirmation_code, provider, external_user_id, status, stores_affected) VALUES ($1, 'meta', $2, 'done', $3)`, [code, userId, affected.rowCount ?? 0]);
  for (const row of affected.rows) await audit(pool, row.store_id, 'Meta', 'meta.data_deletion', userId, { confirmationCode: code });
  const base = env.FRONTEND_URL.replace(/\/$/, '');
  return { url: `${base}/exclusao-dados?codigo=${code}`, confirmation_code: code };
}
