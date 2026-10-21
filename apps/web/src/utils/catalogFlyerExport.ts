import html2canvas from 'html2canvas';
import { nestGet } from '../services/nestClient';
import { downloadBlob } from './commercialPdf';
import { flyerPngFileName, needsImageInline } from './catalogFlyerShared';

export { flyerCssBackground, flyerPngFileName, needsImageInline } from './catalogFlyerShared';

/**
 * Export do flyer do Catálogo Digital (PNG + preparação para impressão).
 *
 * Problemas que este módulo evita:
 * - `canvas.toDataURL()` + `<a download>` em data URL gigante → Chrome abre a URL e falha
 *   com “Não é possível abrir este arquivo”.
 * - Capa HTTPS (Apple/Commons) sem CORS → canvas “tainted” e toDataURL/toBlob estouram.
 * - `background-image: url(data:…)` enorme no CSS → preview de impressão do Chromium quebra.
 */

const inlineCache = new Map<string, string>();

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.readAsDataURL(blob);
  });
}

/** Converte HTTPS → data URL via API (mesmo origin; sem CORS no canvas). */
export async function inlineFlyerImage(src: string): Promise<string> {
  const value = String(src || '').trim();
  if (!value || value === 'none') return '';
  if (value.startsWith('data:image/')) return value;
  if (!needsImageInline(value)) return value;

  const cached = inlineCache.get(value);
  if (cached) return cached;

  try {
    const { dataUrl } = await nestGet<{ dataUrl: string }>(
      `/product-images/inline?url=${encodeURIComponent(value)}`,
    );
    if (!dataUrl?.startsWith('data:image/')) {
      throw new Error('Resposta de imagem inválida.');
    }
    inlineCache.set(value, dataUrl);
    return dataUrl;
  } catch {
    // Fallback: tenta CORS direto (Commons costuma liberar; Apple não).
    const response = await fetch(value, { mode: 'cors', credentials: 'omit', cache: 'force-cache' });
    if (!response.ok) throw new Error('Não foi possível carregar a capa para exportar.');
    const dataUrl = await blobToDataUrl(await response.blob());
    if (!dataUrl.startsWith('data:image/')) throw new Error('A capa não é uma imagem válida.');
    inlineCache.set(value, dataUrl);
    return dataUrl;
  }
}

export async function waitForFlyerImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll('img'));
  await Promise.all(
    images.map(async (img) => {
      if (img.complete && img.naturalWidth > 0) return;
      try {
        await img.decode();
      } catch {
        await new Promise<void>((resolve) => {
          img.addEventListener('load', () => resolve(), { once: true });
          img.addEventListener('error', () => resolve(), { once: true });
        });
      }
    }),
  );
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.size < 32) {
        reject(new Error('PNG da propaganda ficou vazio.'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

/** Captura o article do flyer em PNG (blob) — sem data URL no download. */
export async function captureFlyerPngBlob(flyerEl: HTMLElement): Promise<Blob> {
  await waitForFlyerImages(flyerEl);
  const canvas = await html2canvas(flyerEl, {
    scale: 2,
    useCORS: true,
    allowTaint: false,
    backgroundColor: '#0f1115',
    logging: false,
    imageTimeout: 15000,
  });
  return canvasToPngBlob(canvas);
}

export function downloadFlyerPngBlob(blob: Blob, slugOrId: string) {
  downloadBlob(blob, flyerPngFileName(slugOrId));
}
