/**
 * Ícone padrão de uma marca a partir do nome, usando o Simple Icons (biblioteca aberta de
 * logos de marcas, licença CC0). O SVG é baixado uma vez e guardado no banco: o totem nunca
 * depende do site externo para mostrar a vitrine.
 */
const SIMPLE_ICONS_URL = 'https://cdn.simpleicons.org';
const MAX_SVG_BYTES = 60_000;

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

export async function fetchBrandLogo(name: string): Promise<string | null> {
  const slug = brandIconSlug(name);
  if (!slug || slug.length > 40) return null;
  try {
    const response = await fetch(`${SIMPLE_ICONS_URL}/${slug}`, { signal: AbortSignal.timeout(6000), redirect: 'error' });
    if (!response.ok) return null;
    if (!(response.headers.get('content-type') ?? '').includes('svg')) return null;
    const svg = await response.text();
    if (svg.length > MAX_SVG_BYTES || !/^\s*<svg[\s>]/i.test(svg)) return null;
    return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
  } catch {
    return null;
  }
}
