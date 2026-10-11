import { createHmac } from 'node:crypto';
import { env } from '../../config/env.js';

/** Versão da Graph/Marketing API usada em todas as chamadas (ver docs/marthi-ads.md). */
export const META_GRAPH_VERSION = env.META_GRAPH_VERSION;
const GRAPH_HOST = 'https://graph.facebook.com';

/** Erro devolvido pela Meta, com os campos oficiais (code, error_subcode, is_transient, error_user_msg). */
export class MetaApiError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly subcode: number | null,
    public readonly transient: boolean,
    public readonly userMessage: string,
    public readonly httpStatus: number,
    public readonly traceId: string,
  ) {
    super(message);
  }
  /** Token expirado, revogado ou sem sessão (código 190, e 102 de sessão). */
  get isAuth() {
    return this.code === 190 || this.code === 102;
  }
  /** Permissão faltando (200–299 e 10). */
  get isPermission() {
    return this.code === 10 || (this.code >= 200 && this.code <= 299);
  }
}

/** A Meta não respondeu a tempo: o objeto PODE ter sido criado — concilie antes de repetir. */
export class MetaTimeoutError extends Error {}

type Fetch = typeof fetch;
let fetchImpl: Fetch = (...args) => globalThis.fetch(...args);
let retryDelayMs = 600;
/** Só para testes automatizados: troca o transporte HTTP (nunca usado pela interface de produção). */
export function setGraphTransportForTests(next: Fetch | null, delayMs = 0) {
  fetchImpl = next ?? ((...args) => globalThis.fetch(...args));
  retryDelayMs = next ? delayMs : 600;
}

// Códigos que a Meta trata como temporários / limite de chamadas.
const TRANSIENT_CODES = new Set([1, 2, 4, 17, 32, 341, 613, 80000, 80003, 80004, 80014]);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Prova do segredo do app (recomendada pela Meta para chamadas de servidor). */
/** Tokens que a própria loja gerou no app Meta dela: não levam a prova do app do Marthi (seria recusada). */
const storeProvidedTokens = new Set<string>();
export function markStoreProvidedToken(token: string) {
  storeProvidedTokens.add(token);
}

function appSecretProof(token: string) {
  if (storeProvidedTokens.has(token)) return '';
  return env.META_APP_SECRET ? createHmac('sha256', env.META_APP_SECRET).update(token).digest('hex') : '';
}

type CallOptions = {
  token?: string;
  params?: Record<string, unknown>;
  /** Multipart (upload de vídeo). */
  form?: FormData;
  timeoutMs?: number;
};

function encodeValue(value: unknown) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

async function callOnce(method: 'GET' | 'POST' | 'DELETE', path: string, options: CallOptions) {
  const url = new URL(`${GRAPH_HOST}/${META_GRAPH_VERSION}/${path.replace(/^\//, '')}`);
  const params: Record<string, unknown> = { ...(options.params ?? {}) };
  if (options.token) {
    params.access_token = options.token;
    const proof = appSecretProof(options.token);
    if (proof) params.appsecret_proof = proof;
  }
  let body: BodyInit | undefined;
  if (method === 'GET' || method === 'DELETE') {
    for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null) url.searchParams.set(key, encodeValue(value));
  } else if (options.form) {
    for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null) options.form.set(key, encodeValue(value));
    body = options.form;
  } else {
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null) form.set(key, encodeValue(value));
    body = form;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
  let response: Response;
  try {
    response = await fetchImpl(url, { method, body, signal: controller.signal });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw new MetaTimeoutError(`A Meta não respondeu a tempo (${method} ${path}).`);
    throw new MetaTimeoutError(`Falha de rede ao falar com a Meta (${method} ${path}): ${(error as Error)?.message ?? error}`);
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok || json?.error) {
    const e = json?.error ?? {};
    throw new MetaApiError(
      e.message || `Erro ${response.status} da Meta.`,
      Number(e.code) || response.status,
      e.error_subcode != null ? Number(e.error_subcode) : null,
      Boolean(e.is_transient) || TRANSIENT_CODES.has(Number(e.code)),
      e.error_user_msg || e.error_user_title || '',
      response.status,
      e.fbtrace_id || '',
    );
  }
  return json;
}

/**
 * Chamada à Graph API. Retentativa limitada (3 vezes, espera crescente) só quando a Meta RESPONDEU com
 * erro temporário — nesse caso nada foi criado. Timeout/rede nunca é repetido aqui: quem chamou
 * concilia antes (o objeto pode ter sido criado).
 */
export async function graph<T = any>(method: 'GET' | 'POST' | 'DELETE', path: string, options: CallOptions = {}): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return (await callOnce(method, path, options)) as T;
    } catch (error) {
      attempt += 1;
      if (error instanceof MetaApiError && error.transient && attempt < 3 && !options.form) {
        await sleep(retryDelayMs * 2 ** (attempt - 1));
        continue;
      }
      throw error;
    }
  }
}

/** Todas as páginas de uma listagem (paginação por cursor `paging.next`). */
export async function graphList<T = any>(path: string, options: CallOptions, limit = 200): Promise<T[]> {
  const items: T[] = [];
  let after: string | undefined;
  do {
    const page: any = await graph('GET', path, { ...options, params: { ...(options.params ?? {}), limit: 100, ...(after ? { after } : {}) } });
    items.push(...(page?.data ?? []));
    after = page?.paging?.next ? page?.paging?.cursors?.after : undefined;
  } while (after && items.length < limit);
  return items;
}

/** Texto do erro da Meta em linguagem de lojista, com o que fazer. */
export function explainMetaError(error: unknown) {
  if (error instanceof MetaTimeoutError) return 'A Meta demorou para responder. O Marthi vai conferir se a etapa foi criada antes de tentar de novo.';
  if (!(error instanceof MetaApiError)) return (error as Error)?.message || 'Erro inesperado ao falar com a Meta.';
  if (error.isAuth) return 'A conexão com a Meta expirou ou foi removida. Vá em Contas conectadas e conecte de novo.';
  if (error.isPermission) return `A Meta recusou por falta de permissão${error.userMessage ? `: ${error.userMessage}` : ''}. Confira em Contas conectadas se todas as permissões foram concedidas.`;
  if (error.transient) return 'A Meta está limitando as chamadas agora. Tente novamente em alguns minutos.';
  return error.userMessage || error.message;
}
