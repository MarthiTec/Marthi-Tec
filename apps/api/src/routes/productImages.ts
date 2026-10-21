import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { matchReference } from '../services/deviceReference.js';
import { fetchImageAsDataUrl } from '../services/imageProxy.js';
import { loadReferences } from './deviceReference.js';

/**
 * Sugestões de foto da web para o produto sem foto (o vendedor escolhe e ela entra como "foto hospedada").
 * iPhone: a foto oficial do modelo na página da Apple. Demais: busca no Wikimedia Commons (imagens livres).
 * Nada é baixado nem gravado aqui: só a lista de endereços HTTPS para a tela.
 *
 * O endpoint `/inline` baixa a imagem no servidor (data URL) para o flyer PNG/impressão —
 * contorna CORS de hosts como Apple/Commons no canvas do browser.
 */
export const productImagesRouter = Router();

export type ImageSuggestion = { url: string; thumbUrl: string; title: string; source: string; license: string; pageUrl: string };

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const USER_AGENT = 'MarthiERP/1.0 (+https://marthi-totem.discloud.dev)';
const cache = new Map<string, { at: number; items: ImageSuggestion[] }>();
const CACHE_MS = 60 * 60 * 1000;

/** Nome do produto sem o que atrapalha a busca (capacidade, condição, observações entre parênteses). */
export function searchTerm(name: string, brand = '') {
  const clean = name
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b\d+\s*(gb|tb)\b/gi, ' ')
    .replace(/\b(usado|novo|seminovo|lacrado|recondicionado|vitrine|reservado)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const brandWord = brand.trim();
  return brandWord && !clean.toLowerCase().includes(brandWord.toLowerCase()) && !/iphone|redmi|poco|galaxy/i.test(clean) ? `${brandWord} ${clean}` : clean;
}

const stripTags = (value: unknown) => String(value ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/** Resultado da API do Commons → sugestões (só imagens HTTPS do próprio Wikimedia). */
export function commonsSuggestions(json: any): ImageSuggestion[] {
  const pages = Object.values(json?.query?.pages ?? {}) as any[];
  return pages
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((page) => {
      const info = page.imageinfo?.[0];
      if (!info) return null;
      const clean = (raw: string) => {
        try {
          const url = new URL(raw);
          if (url.protocol !== 'https:' || !/(^|\.)wikimedia\.org$/.test(url.hostname)) return '';
          url.search = '';
          return url.href;
        } catch {
          return '';
        }
      };
      const thumbUrl = clean(info.thumburl || info.url);
      const url = clean(info.thumburl || info.url);
      if (!url) return null;
      const meta = info.extmetadata ?? {};
      return {
        url,
        thumbUrl,
        title: String(page.title ?? '').replace(/^File:/, '').replace(/\.[a-z]+$/i, ''),
        source: 'Wikimedia Commons',
        license: [stripTags(meta.LicenseShortName?.value), stripTags(meta.Artist?.value)].filter(Boolean).join(' · '),
        pageUrl: clean(info.descriptionurl || '') || 'https://commons.wikimedia.org',
      };
    })
    .filter((item): item is ImageSuggestion => Boolean(item));
}

async function searchCommons(term: string) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: `filetype:bitmap ${term}`,
    gsrnamespace: '6',
    gsrlimit: '8',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiextmetadatafilter: 'LicenseShortName|Artist',
    iiurlwidth: '800',
  });
  const response = await fetch(`${COMMONS_API}?${params}`, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('A busca de fotos na web não respondeu.');
  return commonsSuggestions(await response.json());
}

productImagesRouter.get('/api/v1/product-images/suggestions', requireAuth, async (req, res, next) => {
  try {
    const name = String(req.query.name ?? '').trim().slice(0, 160);
    const brand = String(req.query.brand ?? '').trim().slice(0, 60);
    if (name.length < 3) {
      res.json({ success: true, data: [] });
      return;
    }
    const term = searchTerm(name, brand);
    const key = term.toLowerCase();
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) {
      res.json({ success: true, data: hit.items });
      return;
    }
    const items: ImageSuggestion[] = [];
    if (/\biphone\b/i.test(name)) {
      const reference = matchReference(term, await loadReferences().catch(() => []));
      if (reference?.image) {
        items.push({ url: reference.image, thumbUrl: reference.image, title: `${reference.model} (foto oficial)`, source: 'Apple', license: 'Foto oficial do fabricante', pageUrl: reference.sourceUrl });
      }
    }
    try {
      items.push(...(await searchCommons(term)));
    } catch {
      // Sem internet ou Commons fora: fica só a foto oficial (quando houver).
    }
    const unique = items.filter((item, index) => items.findIndex((other) => other.url === item.url) === index).slice(0, 9);
    cache.set(key, { at: Date.now(), items: unique });
    res.json({ success: true, data: unique });
  } catch (error) {
    next(error);
  }
});

/** Inline HTTPS → data URL (flyer do Catálogo Digital: print + PNG sem CORS). */
productImagesRouter.get('/api/v1/product-images/inline', requireAuth, async (req, res, next) => {
  try {
    const url = String(req.query.url ?? '').trim();
    const dataUrl = await fetchImageAsDataUrl(url);
    res.json({ success: true, data: { dataUrl } });
  } catch (error) {
    next(error);
  }
});
