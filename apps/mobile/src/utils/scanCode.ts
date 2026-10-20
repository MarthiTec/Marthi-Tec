/**
 * Normaliza payload de câmera (barras / QR) para lookup ou preenchimento de IMEI/EAN.
 * IMEI típico: 15 dígitos (Luhn). Aceita QR com texto/JSON contendo o IMEI.
 */

const IMEI_RE = /\b(\d{15})\b/;
const EAN13_RE = /\b(\d{13})\b/;
const EAN8_RE = /\b(\d{8})\b/;

export function digitsOnly(value: string): string {
  return String(value || '').replace(/\D/g, '');
}

/** Luhn check — IMEI válido costuma passar; não rejeita se falhar (códigos de teste). */
export function looksLikeImei(value: string): boolean {
  const d = digitsOnly(value);
  if (d.length !== 15) return false;
  let sum = 0;
  for (let i = 0; i < 15; i += 1) {
    let n = Number(d[i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

export type NormalizedScan = {
  /** Valor a usar em lookup / campo (preferência: IMEI → EAN → raw) */
  code: string;
  kind: 'imei' | 'ean' | 'raw';
  raw: string;
};

function fromJsonBlob(raw: string): string | null {
  const trimmed = raw.trim();
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return null;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown> | unknown[];
    if (Array.isArray(parsed)) return null;
    for (const key of ['imei', 'IMEI', 'barcode', 'ean', 'code', 'sku']) {
      const v = parsed[key];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Extrai o melhor código de um scan de câmera para estoque / venda.
 */
export function normalizeScanPayload(rawInput: string): NormalizedScan {
  const raw = String(rawInput || '').trim();
  if (!raw) return { code: '', kind: 'raw', raw: '' };

  const fromJson = fromJsonBlob(raw);
  const source = fromJson || raw;

  // Query-ish: imei=... ou ...?imei=...
  const imeiParam = source.match(/(?:^|[?&#])imei=([^&#\s]+)/i)?.[1];
  if (imeiParam) {
    const d = digitsOnly(decodeURIComponent(imeiParam));
    if (d.length >= 14 && d.length <= 17) {
      return { code: d.slice(0, 15), kind: 'imei', raw };
    }
  }

  const imeiMatch = source.match(IMEI_RE);
  if (imeiMatch) {
    return { code: imeiMatch[1], kind: 'imei', raw };
  }

  const digits = digitsOnly(source);
  if (digits.length === 15) {
    return { code: digits, kind: 'imei', raw };
  }
  if (digits.length === 14 || digits.length === 16 || digits.length === 17) {
    // alguns leitores acrescentam dígito; preferir 15 do meio/início
    const fifteen = digits.slice(0, 15);
    return { code: fifteen, kind: 'imei', raw };
  }

  const ean13 = source.match(EAN13_RE);
  if (ean13) return { code: ean13[1], kind: 'ean', raw };
  const ean8 = source.match(EAN8_RE);
  if (ean8 && digits.length === 8) return { code: ean8[1], kind: 'ean', raw };

  if (digits.length >= 8 && digits.length <= 14 && digits === source.replace(/\s/g, '')) {
    return { code: digits, kind: 'ean', raw };
  }

  return { code: source, kind: 'raw', raw };
}

/** Tipos suportados pelo expo-camera para IMEI (code128/39) + EAN/QR. */
export const IMEI_BARCODE_TYPES = [
  'ean13',
  'ean8',
  'code128',
  'code39',
  'code93',
  'qr',
  'upc_a',
  'upc_e',
  'itf14',
  'codabar',
] as const;
