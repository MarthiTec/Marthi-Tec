/**
 * Busca imagens HTTPS no servidor (para o flyer/PNG do catálogo).
 * Evita CORS no browser e bloqueia SSRF óbvio (localhost / IP privado).
 */

const MAX_BYTES = 6 * 1024 * 1024;
const TIMEOUT_MS = 12_000;
const USER_AGENT = 'MarthiERP/1.0 (+https://marthi-totem.discloud.dev)';

const IMAGE_SIGNATURES: Array<[string, number[]]> = [
  ['image/png', [0x89, 0x50, 0x4e, 0x47]],
  ['image/jpeg', [0xff, 0xd8, 0xff]],
  ['image/webp', [0x52, 0x49, 0x46, 0x46]],
  ['image/gif', [0x47, 0x49, 0x46]],
];

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0') return true;
  if (host === '::1' || host === '[::1]') return true;
  // IPv4 literal
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (m) {
    const parts = m.slice(1).map(Number);
    if (parts.some((n) => n > 255)) return true;
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }
  return false;
}

/** Valida URL pública HTTPS antes do fetch (exportado para testes). */
export function assertPublicHttpsImageUrl(raw: string): URL {
  const text = String(raw ?? '').trim();
  if (!text || text.length > 2048) {
    throw Object.assign(new Error('URL da imagem inválida.'), { status: 400 });
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw Object.assign(new Error('URL da imagem inválida.'), { status: 400 });
  }
  if (url.protocol !== 'https:') {
    throw Object.assign(new Error('Só é permitido buscar imagens HTTPS.'), { status: 400 });
  }
  if (url.username || url.password) {
    throw Object.assign(new Error('URL da imagem inválida.'), { status: 400 });
  }
  if (isPrivateHostname(url.hostname)) {
    throw Object.assign(new Error('Não é possível buscar esta imagem.'), { status: 400 });
  }
  return url;
}

function sniffImageType(bytes: Buffer, contentType: string | null): string | null {
  const fromHeader = (contentType || '').split(';')[0].trim().toLowerCase();
  if (fromHeader.startsWith('image/') && fromHeader !== 'image/svg+xml') return fromHeader;
  const hit = IMAGE_SIGNATURES.find(([, signature]) => signature.every((byte, index) => bytes[index] === byte));
  return hit?.[0] ?? null;
}

/** Baixa a imagem e devolve data URL (ou null se não for imagem válida). */
export async function fetchImageAsDataUrl(rawUrl: string): Promise<string> {
  const url = assertPublicHttpsImageUrl(rawUrl);
  const response = await fetch(url.href, {
    headers: { 'user-agent': USER_AGENT, accept: 'image/*,*/*;q=0.8' },
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw Object.assign(new Error('Não foi possível baixar a imagem da capa.'), { status: 502 });
  }
  // Revalida o host final após redirects
  assertPublicHttpsImageUrl(response.url || url.href);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 32 || bytes.length > MAX_BYTES) {
    throw Object.assign(new Error('A imagem da capa é inválida ou grande demais.'), { status: 400 });
  }
  const type = sniffImageType(bytes, response.headers.get('content-type'));
  if (!type) {
    throw Object.assign(new Error('O endereço não aponta para uma imagem.'), { status: 400 });
  }
  return `data:${type};base64,${bytes.toString('base64')}`;
}
