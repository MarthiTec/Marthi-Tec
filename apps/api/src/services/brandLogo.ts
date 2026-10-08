/**
 * Ícone padrão de uma marca a partir do nome. Primeiro o Simple Icons (biblioteca aberta de
 * logos de marcas, licença CC0), por três endereços diferentes: se um deles estiver fora do ar
 * ou bloqueado para o servidor, o próximo responde. Se a marca não estiver na biblioteca, usa o
 * ícone do site oficial da marca (favicon). A imagem é baixada uma vez e guardada no banco: o
 * totem nunca depende do site externo para mostrar a vitrine.
 */
const SIMPLE_ICONS_VERSION = '13.21.0';
const MAX_SVG_BYTES = 60_000;
const MAX_IMAGE_BYTES = 120_000;
const TIMEOUT_MS = 5000;
const HEADERS = { 'user-agent': 'MarthiTec/1.0 (+https://marthi-totem.discloud.dev)', accept: 'image/svg+xml,image/png,image/*;q=0.8' };

/** Nomes comerciais que pertencem a outra marca no Simple Icons. */
const ALIASES: Record<string, string> = {
  iphone: 'apple',
  ipad: 'apple',
  macbook: 'apple',
  redmi: 'xiaomi',
  poco: 'xiaomi',
  galaxy: 'samsung',
  moto: 'motorola',
  pixel: 'google',
};

export function brandIconSlug(name: string) {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');
  return ALIASES[slug] ?? slug;
}

const svgSources = (slug: string) => [
  `https://cdn.simpleicons.org/${slug}`,
  `https://cdn.jsdelivr.net/npm/simple-icons@${SIMPLE_ICONS_VERSION}/icons/${slug}.svg`,
  `https://unpkg.com/simple-icons@${SIMPLE_ICONS_VERSION}/icons/${slug}.svg`,
];

const faviconSources = (slug: string) => [
  `https://www.google.com/s2/favicons?domain=${slug}.com&sz=128`,
  `https://icons.duckduckgo.com/ip3/${slug}.com.ico`,
];

function warn(url: string, reason: string) {
  console.warn(`[brand-logo] ${new URL(url).host}: ${reason}`);
}

async function fetchSvg(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (response.status === 404) return null;
    if (!response.ok) return warn(url, `HTTP ${response.status}`), null;
    if (!(response.headers.get('content-type') ?? '').includes('svg')) return warn(url, `tipo ${response.headers.get('content-type')}`), null;
    const svg = await response.text();
    if (svg.length > MAX_SVG_BYTES || !/^\s*<svg[\s>]/i.test(svg)) return warn(url, 'conteúdo não é um SVG'), null;
    return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
  } catch (error) {
    warn(url, error instanceof Error ? `${error.name}: ${(error.cause as Error | undefined)?.message ?? error.message}` : 'falha');
    return null;
  }
}

const IMAGE_SIGNATURES: Array<[string, number[]]> = [
  ['image/png', [0x89, 0x50, 0x4e, 0x47]],
  ['image/x-icon', [0x00, 0x00, 0x01, 0x00]],
  ['image/jpeg', [0xff, 0xd8, 0xff]],
];

async function fetchImage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    // Ícone minúsculo (globo genérico de "site sem ícone") não serve como logo da marca.
    if (bytes.length < 200 || bytes.length > MAX_IMAGE_BYTES) return null;
    const type = IMAGE_SIGNATURES.find(([, signature]) => signature.every((byte, index) => bytes[index] === byte))?.[0];
    if (!type) return null;
    return `data:${type};base64,${bytes.toString('base64')}`;
  } catch (error) {
    warn(url, error instanceof Error ? `${error.name}: ${(error.cause as Error | undefined)?.message ?? error.message}` : 'falha');
    return null;
  }
}

export async function fetchBrandLogo(name: string): Promise<string | null> {
  const slug = brandIconSlug(name);
  if (!slug || slug.length > 40) return null;
  for (const url of svgSources(slug)) {
    const logo = await fetchSvg(url);
    if (logo) return logo;
  }
  for (const url of faviconSources(slug)) {
    const logo = await fetchImage(url);
    if (logo) return logo;
  }
  console.warn(`[brand-logo] nenhum ícone encontrado para "${name}" (${slug})`);
  return null;
}
