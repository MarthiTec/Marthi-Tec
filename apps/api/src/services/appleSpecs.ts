/**
 * Ficha técnica oficial do iPhone (página "Especificações técnicas" do suporte da Apple, em português):
 * cada seção <h3> vira uma linha curta da ficha do produto. Só lê texto; nada da página é executado.
 */
export type SpecLine = { label: string; value: string };

const ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', aacute: 'á', agrave: 'à', acirc: 'â', atilde: 'ã',
  eacute: 'é', ecirc: 'ê', iacute: 'í', oacute: 'ó', ocirc: 'ô', otilde: 'õ', uacute: 'ú', ccedil: 'ç',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ccedil: 'Ç', ndash: '-', mdash: '-', shy: '', fnof: 'ƒ', times: 'x', deg: '°', ordf: 'ª', ordm: 'º',
};

function clean(html: string) {
  return html
    .replace(/<sup\b[\s\S]*?<\/sup>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (all, key: string) => {
      if (key.startsWith('#')) return String.fromCodePoint(key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1)));
      return ENTITIES[key] ?? ENTITIES[key.toLowerCase()] ?? all;
    })
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.:;)])/g, '$1')
    .replace(/\(\s+/g, '(')
    .trim();
}

/** Seções da página: título → itens (cada <li>, ou cada <p> quando a seção não tem lista). */
export function appleSpecSections(html: string) {
  const sections = new Map<string, string[]>();
  for (const match of html.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3\b|<h2\b|$)/gi)) {
    const title = clean(match[1]).replace(/\s*\d+$/, '');
    if (!title || sections.has(title)) continue;
    const body = match[2];
    const pick = (tag: string) => [...body.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi'))].map((m) => clean(m[1])).filter(Boolean);
    const items = pick('li');
    sections.set(title, items.length ? items : pick('p'));
  }
  return sections;
}

const short = (text: string, max = 180) => (text.length > max ? `${text.slice(0, max - 1).replace(/[\s,;:]+\S*$/, '')}…` : text);
const join = (items: string[], max = 4) => short(items.slice(0, max).join(' · '), 240);

/** Monta as linhas no padrão da ficha do Marthi a partir das seções oficiais. */
export function parseAppleSpecs(html: string, base: { model: string; capacities: string[] }): SpecLine[] {
  const s = appleSpecSections(html);
  const find = (...titles: string[]) => {
    for (const [title, items] of s) if (titles.some((t) => title.toLowerCase().startsWith(t.toLowerCase()))) return items;
    return [] as string[];
  };
  const lines: SpecLine[] = [];
  const add = (label: string, value: string) => {
    const text = value.trim();
    if (text) lines.push({ label, value: short(text, 240) });
  };

  add('Marca', 'Apple');
  add('Modelo', clean(base.model));

  const screen = find('Tela');
  add('Tela', join(screen.filter((item) => /retina|oled|lcd|polegadas|resolu|hz/i.test(item)), 4));
  const inches = screen.join(' ').match(/(\d+[,.]\d+)\s*polegadas/i)?.[1];
  add('Tamanho da tela', inches ? `${inches.replace('.', ',')} polegadas` : '');

  const chip = find('Chip');
  add('Processador', join(chip.filter((item, index) => index === 0 || /cpu|gpu|neural/i.test(item)), 3));

  add('Armazenamento', base.capacities.join(' · '));

  const camera = find('Câmera', 'Sistema de câmeras', 'Câmeras');
  const lenses = camera
    .filter((item) => /\d+\s*MP/i.test(item) && !/^(também|até|zoom|com|panorama)\b/i.test(item))
    .map((item) => item.split(':')[0].replace(/\s*\([^)]*\)/g, '').trim())
    .filter((item) => item.length <= 70);
  add('Câmera traseira', join(lenses.length ? lenses : camera, 4));
  add('Câmera frontal', join(find('Câmera frontal', 'Câmera TrueDepth').slice(0, 2), 2));

  const battery = find('Energia e bateria', 'Bateria');
  add('Bateria', join(battery.filter((item) => /reprodução de vídeo|streaming|áudio/i.test(item)), 3) || join(battery, 1));

  add('Sistema operacional', find('Sistema operacional')[0] ?? '');

  const radio = find('Rede celular', 'Conexões sem fio');
  const connectivity = radio.filter((item) => /^(5G|4G|LTE|Wi-?Fi|Bluetooth|NFC|Thread)/i.test(item) && item.length < 90);
  add('Conectividade', join(connectivity.length ? connectivity : radio.filter((item) => /wi-?fi|bluetooth|nfc|5g/i.test(item)).map((item) => short(item, 60)), 5));

  add('Chip', join(find('Cartão SIM'), 3));
  add('Resistência à água', (find('Resistência a respingos', 'Resistência')[0] ?? '').replace(/^Classificad[oa]s? como\s*/i, ''));
  add('Sensores', join(find('Sensores'), 8));

  const size = find('Tamanho e peso').join(' ');
  const measure = (label: string) => size.match(new RegExp(`${label}:\\s*([\\d.,]+)\\s*mm`, 'i'))?.[1];
  const [h, w, d] = [measure('Altura'), measure('Largura'), measure('Espessura')];
  if (h && w && d) add('Dimensões', `${h} x ${w} x ${d} mm (A x L x E)`);
  add('Peso', size.match(/Peso:\s*([\d.,]+\s*gramas)/i)?.[1] ?? '');

  const port = [...find('Recarga e conexões'), ...find('Botões e conectores')].join(' ');
  add('Conector', /usb-c/i.test(port) ? `USB-C${/usb\s*3/i.test(port) ? ' (USB 3)' : /usb\s*2/i.test(port) ? ' (USB 2)' : ''}` : /lightning/i.test(port) ? 'Lightning' : '');
  add('Acompanha', join(find('Conteúdo da caixa', 'Na caixa'), 4));
  return lines;
}

/** Link da página de especificações em português (só do suporte da Apple, por HTTPS). */
export function appleSpecsUrl(sourceUrl: string): string | null {
  try {
    const url = new URL(sourceUrl.replace(/&#x3D;|&#61;/gi, '=').replace(/&amp;/g, '&'));
    if (url.protocol !== 'https:' || url.hostname !== 'support.apple.com') return null;
    const id = url.pathname.match(/(?:^|\/)(\d{5,7})$/)?.[1];
    if (id) return `https://support.apple.com/pt-br/${id}`;
    // Modelos antigos: /kb/SP830 (a Apple redireciona para a página em português).
    const kb = url.pathname.match(/\/kb\/(SP\d{3,4})$/i)?.[1];
    return kb ? `https://support.apple.com/kb/${kb.toUpperCase()}?locale=pt_BR` : null;
  } catch {
    return null;
  }
}

/**
 * Ficha a partir da resposta da API de aparelhos (outras marcas). Os nomes dos campos variam entre
 * versões do fornecedor, então procura cada informação pelo nome do campo, em qualquer nível.
 */
export function catalogSpecLines(device: { brand: string; model: string; capacities: string[]; specifications?: unknown }): SpecLine[] {
  const flat: Array<[string, string]> = [];
  const walk = (value: unknown, path: string, depth: number) => {
    if (depth > 4 || value == null) return;
    if (typeof value === 'string' || typeof value === 'number') {
      const text = String(value).replace(/\s+/g, ' ').trim();
      if (text && text.length <= 300) flat.push([path.toLowerCase(), text]);
    } else if (Array.isArray(value)) {
      const parts = value.filter((v) => typeof v === 'string' || typeof v === 'number').map(String);
      if (parts.length) flat.push([path.toLowerCase(), parts.join(', ')]);
      else value.slice(0, 5).forEach((v, i) => walk(v, `${path}.${i}`, depth + 1));
    } else if (typeof value === 'object') {
      for (const [key, v] of Object.entries(value as Record<string, unknown>)) walk(v, path ? `${path}.${key}` : key, depth + 1);
    }
  };
  walk(device.specifications, '', 0);
  const pick = (pattern: RegExp, avoid?: RegExp) => flat.find(([key]) => pattern.test(key) && !(avoid && avoid.test(key)))?.[1] ?? '';
  const lines: SpecLine[] = [];
  const add = (label: string, value: string) => value && lines.push({ label, value: short(value, 240) });
  add('Marca', device.brand);
  add('Modelo', device.model);
  add('Tela', pick(/display.*(type|tech)|screen.*type/));
  add('Tamanho da tela', pick(/(display|screen).*size|size.*inch/));
  add('Processador', pick(/chipset|processor|soc\b|platform.*chip/));
  add('Armazenamento', device.capacities.join(' · '));
  add('Memória RAM', pick(/\bram\b|memory.*ram/));
  add('Câmera traseira', pick(/main.?camera|rear.?camera|back.?camera|primary.?camera/, /video|feature/));
  add('Câmera frontal', pick(/selfie|front.?camera/, /video|feature/));
  add('Bateria', pick(/battery.*(capacity|type|mah)|^battery$/));
  add('Sistema operacional', pick(/(^|\.)os$|operating.?system|platform.*os/));
  add('Conectividade', pick(/network.*technology|^technology$|wlan|wi.?fi/));
  add('Chip', pick(/\bsim\b/));
  add('Resistência à água', pick(/\bip\d|water|dust/));
  add('Sensores', pick(/sensor/));
  add('Dimensões', pick(/dimension/));
  add('Peso', pick(/weight/));
  return lines;
}
