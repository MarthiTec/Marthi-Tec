/**
 * Regras de mídia do anúncio de Tráfego no Feed do Facebook (guia oficial de anúncios da Meta,
 * consultado em 10/2026): imagem JPG/PNG até 30 MB, largura mínima 600 px, proporção entre 1,91:1 e
 * 4:5 (tolerância de 3%); vídeo MP4/MOV de 1 s a 240 min. O Marthi aceita vídeos de até 100 MB pelo
 * envio simples. As verificações ajudam a corrigir — a aprovação é sempre da Meta.
 */
export const IMAGE_RULES = { mimes: ['image/jpeg', 'image/png'], maxBytes: 30 * 1024 * 1024, minWidth: 600, minRatio: 0.8, maxRatio: 1.91, tolerance: 0.03 };
export const VIDEO_RULES = { mimes: ['video/mp4', 'video/quicktime'], maxBytes: 100 * 1024 * 1024, minSeconds: 1, maxSeconds: 240 * 60 };

/** Largura e altura lidas do próprio arquivo (PNG ou JPEG), sem confiar no navegador. */
export function imageSize(bytes: Buffer): { width: number; height: number; mime: string } | null {
  if (bytes.length > 24 && bytes.readUInt32BE(0) === 0x89504e47) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), mime: 'image/png' };
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1];
      const length = bytes.readUInt16BE(offset + 2);
      // SOF0..SOF15 (menos DHT/JPG/DAC) trazem altura e largura.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7), mime: 'image/jpeg' };
      }
      offset += 2 + length;
    }
  }
  return null;
}

export type MediaIssue = { level: 'error' | 'warning'; message: string };

export function checkImage(bytes: Buffer): { issues: MediaIssue[]; width: number | null; height: number | null; mime: string } {
  const size = imageSize(bytes);
  const issues: MediaIssue[] = [];
  if (!size) return { issues: [{ level: 'error', message: 'Use uma imagem JPG ou PNG.' }], width: null, height: null, mime: '' };
  if (bytes.length > IMAGE_RULES.maxBytes) issues.push({ level: 'error', message: 'A imagem passa de 30 MB.' });
  if (size.width < IMAGE_RULES.minWidth) issues.push({ level: 'error', message: `A imagem tem ${size.width}px de largura; o mínimo é ${IMAGE_RULES.minWidth}px.` });
  const ratio = size.width / size.height;
  if (ratio < IMAGE_RULES.minRatio * (1 - IMAGE_RULES.tolerance) || ratio > IMAGE_RULES.maxRatio * (1 + IMAGE_RULES.tolerance)) {
    issues.push({ level: 'error', message: `Proporção ${ratio.toFixed(2)}:1 fora do aceito no Feed (entre 1,91:1 deitada e 4:5 em pé). Recorte a imagem.` });
  } else if (Math.abs(ratio - 1) > 0.03 && Math.abs(ratio - 0.8) > 0.03) {
    issues.push({ level: 'warning', message: 'A Meta recomenda imagens quadradas (1:1) ou em pé (4:5) para o Feed.' });
  }
  if (size.width < 1080) issues.push({ level: 'warning', message: 'Para ficar nítida, prefira pelo menos 1080px de largura.' });
  return { issues, width: size.width, height: size.height, mime: size.mime };
}

export function checkVideo(input: { mime: string; bytes: number; durationSec?: number | null }): MediaIssue[] {
  const issues: MediaIssue[] = [];
  if (!VIDEO_RULES.mimes.includes(input.mime)) issues.push({ level: 'error', message: 'Use vídeo MP4 ou MOV.' });
  if (input.bytes > VIDEO_RULES.maxBytes) issues.push({ level: 'error', message: 'O vídeo passa de 100 MB (limite do envio pelo Marthi).' });
  if (input.durationSec != null) {
    if (input.durationSec < VIDEO_RULES.minSeconds) issues.push({ level: 'error', message: 'O vídeo precisa ter pelo menos 1 segundo.' });
    if (input.durationSec > VIDEO_RULES.maxSeconds) issues.push({ level: 'error', message: 'O vídeo passa de 240 minutos.' });
    if (input.durationSec > 60) issues.push({ level: 'warning', message: 'Vídeos curtos (até 15–30 s) costumam funcionar melhor em anúncios.' });
  }
  return issues;
}

/** data:image/png;base64,... → bytes. */
export function dataUrlBytes(dataUrl: string): { mime: string; bytes: Buffer } | null {
  const match = /^data:([\w/+.-]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) return null;
  return { mime: match[1], bytes: Buffer.from(match[2], 'base64') };
}
