import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { pool } from '../db/pool.js';
import { env } from '../config/env.js';
import { normalizeDeviceText, type DeviceReference } from './deviceReference.js';

const encryptionKey = () => createHash('sha256').update('device-catalog:' + env.JWT_SECRET).digest();

export function encryptCatalogKey(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
}

export function decryptCatalogKey(value: string) {
  const [iv, tag, payload] = value.split('.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv!, 'base64'));
  decipher.setAuthTag(Buffer.from(tag!, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(payload!, 'base64')), decipher.final()]).toString('utf8');
}

const KEEP_UPPER = new Set(['FE', '5G', 'LTE', 'SE', 'GT', 'NEO']);
const MARKETING_CASE: Record<string, string> = {
  PRO: 'Pro',
  PLUS: 'Plus',
  ULTRA: 'Ultra',
  CLASSIC: 'Classic',
  POWER: 'Power',
  STYLUS: 'Stylus',
  FUSION: 'Fusion',
  FLIP: 'Flip',
  FOLD: 'Fold',
  NOTE: 'Note',
  AIR: 'Air',
  MAX: 'Max',
};

function titleCaseModel(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .map((part) => {
      const upper = part.toUpperCase();
      if (KEEP_UPPER.has(upper)) return upper;
      if (MARKETING_CASE[upper]) return MARKETING_CASE[upper];
      if (/^\d/.test(part)) return part.toUpperCase();
      // Códigos tipo 12C / A3 / X6 ficam em maiúsculas curtas.
      if (/^[a-z]*\d+[a-z]*$/i.test(part) && part.length <= 4) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}

/** Junta número ao prefixo da linha (S/A/G/E/C): "24 ultra" → "24 Ultra". */
function gluedLineSuffix(rest: string) {
  const parts = rest.split(' ').filter(Boolean);
  if (!parts.length) return '';
  const head = parts[0]!;
  const tail = titleCaseModel(parts.slice(1).join(' '));
  return head + (tail ? ' ' + tail : '');
}

/**
 * Converte nome do catálogo (Tipo + Modelo, ex. "GALAXY S 24 ULTRA") para o formato
 * que a DeviceSpecs/RapidAPI espera (ex. "Galaxy S24 Ultra").
 */
export function toProviderModelQuery(brandName: string, rawModel: string): string {
  const brand = normalizeDeviceText(brandName);
  const n = normalizeDeviceText(rawModel);
  if (!n) return rawModel.trim();

  if (brand === 'samsung') {
    let m = n.match(/^galaxy s (.+)$/);
    if (m) return 'Galaxy S' + gluedLineSuffix(m[1]!);
    m = n.match(/^galaxy a (.+)$/);
    if (m) return 'Galaxy A' + gluedLineSuffix(m[1]!);
    m = n.match(/^galaxy z (.+)$/);
    if (m) {
      const z = m[1]!.replace(/\bflip\s+(\d)/g, 'Flip$1').replace(/\bfold\s+(\d)/g, 'Fold$1');
      return 'Galaxy Z ' + titleCaseModel(z);
    }
    m = n.match(/^galaxy tab (.+)$/);
    if (m) return 'Galaxy Tab ' + titleCaseModel(m[1]!);
    m = n.match(/^galaxy watch (.+)$/);
    if (m) return 'Galaxy Watch ' + titleCaseModel(m[1]!);
    m = n.match(/^galaxy buds (.+)$/);
    if (m) return 'Galaxy Buds' + gluedLineSuffix(m[1]!);
  }

  if (brand === 'xiaomi') {
    let m = n.match(/^redmi note (.+)$/);
    if (m) return 'Redmi Note ' + titleCaseModel(m[1]!);
    m = n.match(/^redmi (.+)$/);
    if (m) return 'Redmi ' + titleCaseModel(m[1]!);
    m = n.match(/^poco (.+)$/);
    if (m) return 'Poco ' + titleCaseModel(m[1]!);
    m = n.match(/^xiaomi (.+)$/);
    if (m) return 'Xiaomi ' + titleCaseModel(m[1]!);
  }

  if (brand === 'motorola') {
    let m = n.match(/^moto g (.+)$/);
    if (m) return (/^\d/.test(m[1]!) ? 'Moto G' : 'Moto G ') + gluedLineSuffix(m[1]!).replace(/^ /, '');
    m = n.match(/^moto e (.+)$/);
    if (m) return (/^\d/.test(m[1]!) ? 'Moto E' : 'Moto E ') + gluedLineSuffix(m[1]!).replace(/^ /, '');
    m = n.match(/^edge (.+)$/);
    if (m) return 'Edge ' + titleCaseModel(m[1]!);
    m = n.match(/^razr (.+)$/);
    if (m) return 'razr ' + titleCaseModel(m[1]!);
  }

  if (brand === 'realme') {
    let m = n.match(/^realme note (.+)$/);
    if (m) return 'Realme Note ' + titleCaseModel(m[1]!);
    m = n.match(/^realme c (.+)$/);
    if (m) return 'Realme C' + gluedLineSuffix(m[1]!);
    m = n.match(/^realme (.+)$/);
    if (m) return 'Realme ' + titleCaseModel(m[1]!);
  }

  return rawModel.trim().replace(/\s+/g, ' ');
}

/** O fornecedor manda textos com entidades HTML (ex.: "A76 &amp; A55"): devolve o texto limpo em todo o objeto. */
const ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
export function decodeEntities<T>(value: T): T {
  if (typeof value === 'string') {
    return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
      if (code[0] === '#') {
        const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
        return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : match;
      }
      return ENTITIES[code.toLowerCase()] ?? match;
    }) as T;
  }
  if (Array.isArray(value)) return value.map((entry) => decodeEntities(entry)) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, decodeEntities(entry)])) as T;
  return value;
}

export function parseDeviceSpecs(raw: any, sourceUrl: string): DeviceReference & { specifications: any; fetchedAt: string } {
  const data = decodeEntities(raw?.data ?? raw);
  if (Array.isArray(data) && data.length !== 1) throw new Error('O fornecedor retornou mais de um modelo. Informe o nome completo.');
  const item = Array.isArray(data) ? data[0] : data;
  if (!item || typeof item !== 'object') throw new Error('Resposta de especificações inválida.');
  const brand = String(item.manufacturer ?? item.brand ?? '').trim();
  const model = String(item.model ?? item.phone_name ?? '').trim();
  if (!brand || !model) throw new Error('O fornecedor não informou marca e modelo.');
  const colors = [
    ...new Set(
      (Array.isArray(item.colors) ? item.colors : typeof item.colors === 'string' ? item.colors.split(',') : [])
        .map((v: any) => String(v).trim())
        .filter(Boolean),
    ),
  ] as string[];
  const memory = item.normalizedSpecs?.memoryOptions ?? item.normalized_specs?.memory_options;
  let capacities: string[] = [];
  if (Array.isArray(memory?.availableStorageGb ?? memory?.available_storage_gb)) {
    capacities = (memory.availableStorageGb ?? memory.available_storage_gb)
      .filter((n: any) => Number.isFinite(Number(n)) && Number(n) > 0)
      .map((n: any) => (Number(n) >= 1024 && Number(n) % 1024 === 0 ? Number(n) / 1024 + 'TB' : Number(n) + 'GB'));
  } else {
    capacities = [...String(item.internalRaw ?? item.internal_raw ?? '').matchAll(/(\d+)\s*(GB|TB)(?!\s*RAM)\b/gi)].map(
      (m) => m[1] + m[2]!.toUpperCase(),
    );
  }
  // DeviceSpecs docs não documentam URL de foto de produto; só usamos se vier HTTPS explícito.
  const imageCandidate = String(item.thumbnail ?? item.image ?? item.imageUrl ?? item.picture ?? '').trim();
  let image: string | undefined;
  try {
    if (imageCandidate) {
      const url = new URL(imageCandidate);
      if (url.protocol === 'https:') image = url.href;
    }
  } catch {
    image = undefined;
  }
  return {
    brand,
    model,
    colors,
    capacities: [...new Set(capacities)],
    sourceUrl,
    ...(image ? { image } : {}),
    specifications: item,
    fetchedAt: new Date().toISOString(),
  };
}

const pending = new Map<string, Promise<any>>();

export async function loadCatalogDevice(storeId: string, name: string, brandQuery = '') {
  const brands = (await pool.query('SELECT name,aliases,strip_aliases FROM device_catalog_brands')).rows;
  const norm = normalizeDeviceText(name);
  const selected = normalizeDeviceText(brandQuery);
  const brand =
    brands.find((b) => selected && (normalizeDeviceText(b.name) === selected || b.aliases.includes(selected))) ??
    brands.find((b) => b.aliases.some((a: string) => norm === a || norm.startsWith(a + ' ')));
  if (!brand) return null;

  let model = name.trim();
  for (const alias of brand.strip_aliases as string[]) {
    if (normalizeDeviceText(model).startsWith(alias + ' ')) {
      model = model.slice(alias.length).trim();
      break;
    }
  }
  model = toProviderModelQuery(brand.name, model);
  if (normalizeDeviceText(model).length < 3) return null;

  const settings = (
    await pool.query(
      `SELECT s.*, p.base_url, p.adapter
       FROM device_catalog_settings s
       JOIN device_catalog_providers p ON p.id = s.provider_id AND p.active = true
       WHERE s.store_id = $1`,
      [storeId],
    )
  ).rows[0];

  const platformKey = (env.DEVICE_CATALOG_API_KEY || '').trim();
  if (settings && !settings.enabled) {
    throw Object.assign(new Error('A consulta de aparelhos está desativada para esta loja. Ative em API de aparelhos.'), {
      status: 409,
    });
  }

  let apiKey = '';
  let baseUrl = '';
  let providerId = '';
  let cacheDays = 30;
  if (settings?.api_key_encrypted) {
    apiKey = decryptCatalogKey(settings.api_key_encrypted);
    baseUrl = settings.base_url;
    providerId = settings.provider_id;
    cacheDays = settings.cache_days;
  } else if (platformKey) {
    const provider = (
      await pool.query(`SELECT id, base_url FROM device_catalog_providers WHERE id = 'devicespecs' AND active = true`)
    ).rows[0];
    if (!provider) {
      throw Object.assign(new Error('Fornecedor DeviceSpecs indisponível.'), { status: 424 });
    }
    apiKey = platformKey;
    baseUrl = provider.base_url;
    providerId = provider.id;
    cacheDays = settings?.cache_days ?? 30;
  } else {
    throw Object.assign(
      new Error('Configure a chave da API de aparelhos para consultar esta marca (loja ou DEVICE_CATALOG_API_KEY no servidor).'),
      { status: 409 },
    );
  }

  const queryKey = normalizeDeviceText(brand.name + ' ' + model);
  const saved = (
    await pool.query(
      'SELECT data,refreshed_at FROM device_catalog_models WHERE store_id=$1 AND provider_id=$2 AND query_key=$3',
      [storeId, providerId, queryKey],
    )
  ).rows[0];
  if (saved && Date.now() - new Date(saved.refreshed_at).getTime() < cacheDays * 86400000) return decodeEntities(saved.data);

  const requestKey = storeId + ':' + providerId + ':' + queryKey;
  if (!pending.has(requestKey)) {
    pending.set(
      requestKey,
      (async () => {
        // Trava do plano gratuito: no máximo N consultas por dia por chave (o que já foi consultado
        // continua vindo do banco). Conta antes de chamar, de forma atômica.
        const limit = Number(env.DEVICE_CATALOG_DAILY_LIMIT ?? 15);
        if (limit > 0) {
          const scope = settings?.api_key_encrypted ? 'store:' + storeId : 'platform';
          const counted = (
            await pool.query(
              `INSERT INTO device_catalog_usage(scope, day, count) VALUES ($1, (now() AT TIME ZONE 'UTC')::date, 1)
               ON CONFLICT (scope, day) DO UPDATE SET count = device_catalog_usage.count + 1 WHERE device_catalog_usage.count < $2
               RETURNING count`,
              [scope, limit],
            )
          ).rows[0];
          if (!counted) {
            throw Object.assign(
              new Error(`Limite de ${limit} consultas por dia da API de aparelhos atingido. Volta amanhã; aparelhos já consultados continuam disponíveis.`),
              { status: 429 },
            );
          }
        }
        const base = new URL(baseUrl);
        // Hosts oficiais do fornecedor na RapidAPI (GSMArenaParser é a listagem atual).
        if (base.protocol !== 'https:' || !['gsmarenaparser.p.rapidapi.com', 'deviceultraparser.p.rapidapi.com'].includes(base.hostname)) {
          throw new Error('Endereço do fornecedor inválido.');
        }
        const sourceUrl = base.href.replace(/\/$/, '') + '/clean/getspecs/' + encodeURIComponent(brand.name) + '/' + encodeURIComponent(model);
        const response = await fetch(sourceUrl, {
          headers: {
            'x-rapidapi-key': apiKey,
            'x-rapidapi-host': base.hostname,
            accept: 'application/json',
          },
          redirect: 'error',
          signal: AbortSignal.timeout(12000),
        });
        if (response.status === 404) return null;
        if (!response.ok) {
          // O plano grátis (Basic) da RapidAPI bloqueia as rotas desta API: a resposta diz isso no corpo.
          const detail = await response.text().catch(() => '');
          const planBlocked = /disabled for your subscription|not subscribed/i.test(detail);
          // 424 (falha do fornecedor), não 5xx: o proxy do Discloud troca 5xx pela página genérica de erro.
          throw Object.assign(
            new Error(
              planBlocked
                ? 'O plano da RapidAPI não libera esta consulta (o Basic grátis bloqueia a ficha técnica). Assine um plano pago da API GSMArenaParser.'
                : response.status === 401 || response.status === 403
                  ? 'A chave da API de aparelhos não foi aceita.'
                  : response.status === 429
                    ? 'Limite de consultas da API atingido. Tente novamente mais tarde.'
                    : 'Não foi possível consultar a API de aparelhos.',
            ),
            { status: 424 },
          );
        }
        const raw = await response.json();
        const device = parseDeviceSpecs(raw, sourceUrl);
        if (
          normalizeDeviceText(device.brand) !== normalizeDeviceText(brand.name) ||
          normalizeDeviceText(device.model) !== normalizeDeviceText(model)
        ) {
          throw Object.assign(new Error('A API retornou outro modelo. Confira o nome completo do aparelho.'), {
            status: 422,
          });
        }
        await pool.query(
          'INSERT INTO device_catalog_models(store_id,provider_id,query_key,data,raw_data) VALUES($1,$2,$3,$4,$5) ON CONFLICT(store_id,provider_id,query_key) DO UPDATE SET data=EXCLUDED.data,raw_data=EXCLUDED.raw_data,refreshed_at=now()',
          [storeId, providerId, queryKey, JSON.stringify(device), JSON.stringify(raw)],
        );
        return device;
      })().finally(() => pending.delete(requestKey)),
    );
  }
  try {
    return await pending.get(requestKey);
  } catch (error) {
    if (saved) return { ...decodeEntities(saved.data), stale: true };
    throw error;
  }
}
