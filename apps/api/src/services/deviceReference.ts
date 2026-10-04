export type DeviceReference = {
  brand: string;
  model: string;
  colors: string[];
  capacities: string[];
  sourceUrl: string;
};

export const APPLE_REFERENCE_URL = 'https://support.apple.com/pt-br/108044';

export function normalizeDeviceText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[\u2010-\u2015]/g, '-').replace(/[^a-z0-9]+/g, ' ').trim();
}

function text(html: string) {
  const entities: Record<string, string> = {
    nbsp: ' ', amp: '&', quot: '"', apos: "'", aacute: 'á', agrave: 'à', acirc: 'â', atilde: 'ã',
    eacute: 'é', ecirc: 'ê', iacute: 'í', oacute: 'ó', ocirc: 'ô', otilde: 'õ', uacute: 'ú', ccedil: 'ç',
    ndash: '-', mdash: '-', shy: '',
  };
  return html.replace(/<[^>]*>/g, '').replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (all, key: string) => {
    if (key.startsWith('#')) return String.fromCodePoint(key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1)));
    return entities[key.toLowerCase()] ?? all;
  }).replace(/[\u2010-\u2015]/g, '-').replace(/\s+/g, ' ').trim();
}

/** Extract only the model headings and their factual color/capacity paragraphs. */
export function parseAppleModels(html: string): DeviceReference[] {
  const models: DeviceReference[] = [];
  for (const section of html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2\b|$)/gi)) {
    const model = text(section[1]);
    if (!/^iPhone\b/i.test(model)) continue;
    const paragraphs = [...section[2].matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(p => text(p[1]));
    const colorText = paragraphs.find(p => /^Cores?:/i.test(p));
    const capacityText = paragraphs.find(p => /^Capacidade:/i.test(p));
    if (!colorText || !capacityText) continue;
    const colors = colorText.replace(/^Cores?:\s*/i, '').split(/,\s*/).map(c => c.trim()).filter(Boolean);
    const capacities = [...capacityText.matchAll(/(\d+)\s*(GB|TB)\b/gi)].map(c => `${c[1]}${c[2].toUpperCase()}`);
    const link = [...section[2].matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
      .find(a => /especifica/i.test(text(a[2])));
    const url = link ? new URL(link[1], APPLE_REFERENCE_URL) : new URL(APPLE_REFERENCE_URL);
    models.push({ brand: 'Apple', model, colors, capacities: [...new Set(capacities)],
      sourceUrl: url.hostname === 'support.apple.com' ? url.href : APPLE_REFERENCE_URL });
  }
  return models;
}

export function matchReference(query: string, models: DeviceReference[]) {
  const name = normalizeDeviceText(query);
  // Match the entire model prefix to avoid suggesting Pro options for an unfinished Pro Max name.
  return models.sort((a, b) => b.model.length - a.model.length).find(m => {
    const model = normalizeDeviceText(m.model);
    if (name === model) return true;
    if (!name.startsWith(model + ' ')) return false;
    return /^(\d+\s*(gb|tb)\b|usado\b|novo\b|seminovo\b|recondicionado\b)/.test(name.slice(model.length + 1));
  }) ?? null;
}
