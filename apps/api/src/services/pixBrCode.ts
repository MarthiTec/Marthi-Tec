/**
 * Pix BR Code (EMVCo / Banco Central) — payload Copia e Cola e QR.
 * Chave vem de platform_payout_settings (MarthiDB); env só como fallback operacional.
 */

import QRCode from 'qrcode';
import { env } from '../config/env.js';
import { pool } from '../db/pool.js';

export type PixKeyType = 'email' | 'cpf_cnpj' | 'telefone' | 'aleatoria';

export type PlatformPixInfo = {
  keyType: PixKeyType;
  keyValue: string;
  receiverName: string;
  bankName: string;
  source: 'database' | 'env' | 'default';
};

export type BillingPixPayload = {
  keyType: PixKeyType;
  keyValue: string;
  receiverName: string;
  bankName: string;
  amount: number | null;
  currency: string;
  brCode: string;
  qrDataUrl: string | null;
  format: 'brcode_emv';
  source: PlatformPixInfo['source'];
  instructions: string;
};

const DEFAULT_PIX: PlatformPixInfo = {
  keyType: 'email',
  keyValue: 'marthi.tecnologia@gmail.com',
  receiverName: 'Marthi Tecnologia',
  bankName: '',
  source: 'default',
};

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
  if (keyType === 'cpf_cnpj') return raw.replace(/\D/g, '');
  if (keyType === 'telefone') {
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('55') && digits.length >= 12) return `+${digits}`;
    return `+55${digits}`;
  }
  if (keyType === 'email') return raw.toLowerCase();
  return raw;
}

function computeCrc16Ccitt(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) crc = ((crc << 1) ^ 0x1021) & 0xffff;
      else crc = (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function buildPixBrCode(params: {
  keyType: PixKeyType;
  keyValue: string;
  receiverName: string;
  city?: string;
  amount?: number | null;
  txid?: string;
  description?: string;
}): string {
  const normalizedKey = normalizePixKeyForBrCode(params.keyType, params.keyValue);
  const gui = emvField('00', 'br.gov.bcb.pix');
  const keyField = emvField('01', normalizedKey);
  const descClean = params.description ? stripAccents(params.description).slice(0, 35) : '';
  const descField = descClean ? emvField('02', descClean) : '';
  const merchantAccountInfo = emvField('26', `${gui}${keyField}${descField}`);

  const amountField =
    params.amount && Number.isFinite(params.amount) && params.amount > 0
      ? emvField('54', params.amount.toFixed(2))
      : '';

  const merchantName = (stripAccents(params.receiverName || 'MARTHI TECNOLOGIA') || 'MARTHI TECNOLOGIA')
    .toUpperCase()
    .slice(0, 25);
  const merchantCity = (stripAccents(params.city || 'TRES RIOS') || 'TRES RIOS').toUpperCase().slice(0, 15);
  const cleanTxId =
    (params.txid || '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, 25) || '***';

  const basePayload = [
    emvField('00', '01'),
    merchantAccountInfo,
    emvField('52', '0000'),
    emvField('53', '986'),
    amountField,
    emvField('58', 'BR'),
    emvField('59', merchantName),
    emvField('60', merchantCity),
    emvField('62', emvField('05', cleanTxId)),
    '6304',
  ].join('');

  return `${basePayload}${computeCrc16Ccitt(basePayload)}`;
}

function parseKeyType(value: unknown): PixKeyType {
  if (value === 'cpf_cnpj' || value === 'telefone' || value === 'aleatoria' || value === 'email') {
    return value;
  }
  return 'email';
}

/** Lê chave Pix da Marthi: MarthiDB → PLATFORM_PIX_KEY → default oficial. */
export async function loadPlatformPixInfo(): Promise<PlatformPixInfo> {
  if (pool) {
    try {
      const result = await pool.query(
        "SELECT bank_account, pix FROM platform_payout_settings WHERE id = 'platform'",
      );
      const bank = (result.rows[0]?.bank_account ?? {}) as Record<string, unknown>;
      const pix = (result.rows[0]?.pix ?? {}) as Record<string, unknown>;
      const keyValue = typeof pix.keyValue === 'string' ? pix.keyValue.trim() : '';
      if (keyValue) {
        return {
          keyType: parseKeyType(pix.keyType),
          keyValue,
          receiverName:
            (typeof pix.receiverName === 'string' && pix.receiverName.trim()) ||
            (typeof bank.holderName === 'string' && bank.holderName.trim()) ||
            'Marthi Tecnologia',
          bankName:
            (typeof bank.bankName === 'string' && bank.bankName.trim()) ||
            (typeof pix.receiverInstitution === 'string' && pix.receiverInstitution.trim()) ||
            '',
          source: 'database',
        };
      }
    } catch {
      /* fallback abaixo */
    }
  }

  const envKey = env.PLATFORM_PIX_KEY?.trim();
  if (envKey) {
    return {
      keyType: parseKeyType(env.PLATFORM_PIX_KEY_TYPE || 'email'),
      keyValue: envKey,
      receiverName: env.PLATFORM_PIX_RECEIVER_NAME?.trim() || 'Marthi Tecnologia',
      bankName: '',
      source: 'env',
    };
  }

  return { ...DEFAULT_PIX };
}

export async function buildBillingPixPayload(params: {
  amount: number | null;
  currency?: string;
  subscriptionId?: string;
  planId?: string;
}): Promise<BillingPixPayload> {
  const pix = await loadPlatformPixInfo();
  const amount =
    params.amount != null && Number.isFinite(params.amount) && params.amount > 0
      ? Number(params.amount)
      : null;
  const txid = params.subscriptionId
    ? `MARTHI${params.subscriptionId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 18).toUpperCase()}`
    : 'MARTHISUB';
  const brCode = buildPixBrCode({
    keyType: pix.keyType,
    keyValue: pix.keyValue,
    receiverName: pix.receiverName,
    amount,
    txid,
    description: params.planId ? `Assinatura Marthi ${params.planId}` : 'Assinatura Marthi',
  });

  let qrDataUrl: string | null = null;
  try {
    qrDataUrl = await QRCode.toDataURL(brCode, {
      width: 280,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0f172a', light: '#ffffff' },
    });
  } catch {
    qrDataUrl = null;
  }

  return {
    keyType: pix.keyType,
    keyValue: pix.keyValue,
    receiverName: pix.receiverName,
    bankName: pix.bankName,
    amount,
    currency: params.currency || 'BRL',
    brCode,
    qrDataUrl,
    format: 'brcode_emv',
    source: pix.source,
    instructions:
      amount != null
        ? 'Escaneie o QR ou use Pix Copia e Cola com o valor da assinatura. Após o pagamento, a Marthi confirma a liberação.'
        : 'Não há valor em aberto no MarthiDB. Use a chave Pix da Marthi apenas se a equipe indicar o valor devido.',
  };
}
