import { nestApiUrl } from '../services/config';
import type { PixKeyType } from '../data/paymentSettingsStore';

export type PublicPixInfo = {
  keyType: PixKeyType;
  keyValue: string;
  receiverName: string;
  bankName?: string;
};

const DEFAULT_PUBLIC_PIX: PublicPixInfo = {
  keyType: 'email',
  keyValue: 'marthi.tecnologia@gmail.com',
  receiverName: 'Marthi Tecnologia',
};

export async function fetchPublicPixInfo(): Promise<PublicPixInfo> {
  try {
    const base = nestApiUrl();
    const res = await fetch(`${base}/api/v1/payout-settings/public`);
    if (!res.ok) return DEFAULT_PUBLIC_PIX;
    const json = (await res.json()) as {
      success?: boolean;
      data?: {
        pix?: { keyType?: PixKeyType; keyValue?: string; receiverName?: string };
        bankAccount?: { holderName?: string; bankName?: string };
      };
    };
    const keyValue = json?.data?.pix?.keyValue?.trim();
    if (!keyValue) return DEFAULT_PUBLIC_PIX;
    return {
      keyType: json?.data?.pix?.keyType || 'email',
      keyValue,
      receiverName:
        json?.data?.pix?.receiverName?.trim() ||
        json?.data?.bankAccount?.holderName?.trim() ||
        'Marthi Tecnologia',
      bankName: json?.data?.bankAccount?.bankName?.trim() || '',
    };
  } catch {
    return DEFAULT_PUBLIC_PIX;
  }
}

function stripAccents(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 .-]/g, '')
    .trim();
}

function emvField(id: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

function normalizePixKeyForBrCode(keyType: PixKeyType, keyValue: string): string {
  const raw = keyValue.trim();
  if (keyType === 'cpf_cnpj') {
    return raw.replace(/\D/g, '');
  }
  if (keyType === 'telefone') {
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('55') && digits.length >= 12) {
      return `+${digits}`;
    }
    return `+55${digits}`;
  }
  if (keyType === 'email') {
    return raw.toLowerCase();
  }
  return raw;
}

function computeCrc16Ccitt(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Gera o payload oficial Pix Copia e Cola / QR Code (padrão EMVCo / BR Code do Banco Central).
 */
export function buildPixBrCode(params: {
  keyType: PixKeyType;
  keyValue: string;
  receiverName: string;
  city?: string;
  amount?: number;
  txid?: string;
  description?: string;
}): string {
  const normalizedKey = normalizePixKeyForBrCode(params.keyType, params.keyValue);
  const gui = emvField('00', 'br.gov.bcb.pix');
  const keyField = emvField('01', normalizedKey);
  const descClean = params.description ? stripAccents(params.description).slice(0, 35) : '';
  const descField = descClean ? emvField('02', descClean) : '';
  const merchantAccountInfo = emvField('26', `${gui}${keyField}${descField}`);

  const merchantCategoryCode = emvField('52', '0000');
  const transactionCurrency = emvField('53', '986'); // BRL
  const amountField =
    params.amount && Number.isFinite(params.amount) && params.amount > 0
      ? emvField('54', params.amount.toFixed(2))
      : '';
  const countryCode = emvField('58', 'BR');

  const merchantName = (stripAccents(params.receiverName || 'MARTHI TECNOLOGIA') || 'MARTHI TECNOLOGIA')
    .toUpperCase()
    .slice(0, 25);
  const merchantCity = (stripAccents(params.city || 'TRES RIOS') || 'TRES RIOS')
    .toUpperCase()
    .slice(0, 15);

  const cleanTxId =
    (params.txid || '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, 25) || '***';
  const additionalDataField = emvField('62', emvField('05', cleanTxId));

  const basePayload = [
    emvField('00', '01'),
    merchantAccountInfo,
    merchantCategoryCode,
    transactionCurrency,
    amountField,
    countryCode,
    emvField('59', merchantName),
    emvField('60', merchantCity),
    additionalDataField,
    '6304',
  ].join('');

  const crc = computeCrc16Ccitt(basePayload);
  return `${basePayload}${crc}`;
}
