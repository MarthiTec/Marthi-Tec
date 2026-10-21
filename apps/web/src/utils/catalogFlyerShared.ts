/**
 * Helpers puros do flyer do Catálogo Digital (sem DOM / html2canvas).
 * Testáveis em Node; usados por catalogFlyerExport e pela página de propaganda.
 */

export function flyerPngFileName(slugOrId: string): string {
  const safe = String(slugOrId || 'catalogo').replace(/[^\w.-]+/g, '-').slice(0, 80);
  return `marthi-catalogo-propaganda-${safe || 'catalogo'}.png`;
}

/**
 * Só URLs curtas HTTPS entram em CSS `background-image`.
 * data: enorme no CSS faz o Chromium falhar o preview de impressão
 * (“Não é possível abrir este arquivo”).
 */
export function flyerCssBackground(cover: string): string | undefined {
  const src = String(cover || '').trim();
  if (!src || src === 'none') return undefined;
  if (src.startsWith('data:')) return undefined;
  if (!/^https:\/\//i.test(src)) return undefined;
  if (src.length > 1800) return undefined;
  return `url(${JSON.stringify(src)})`;
}

export function needsImageInline(src: string): boolean {
  const value = String(src || '').trim();
  return Boolean(value) && value !== 'none' && /^https:\/\//i.test(value) && !value.startsWith('data:');
}
