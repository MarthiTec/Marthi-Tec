import { nestGet, nestPut } from '../services/nestClient';
import { logAudit } from './auditLog';

export type BankAccountConfig = {
  bankCode: string;
  bankName: string;
  agency: string;
  accountNumber: string;
  accountType: 'corrente' | 'poupanca';
  holderName: string;
  holderDocument: string; // CPF ou CNPJ
  validationStatus: 'pendente' | 'validado' | 'rejeitado';
  updatedAt: string;
  updatedBy: string;
};

export type PixKeyType = 'email' | 'cpf_cnpj' | 'telefone' | 'aleatoria';

export type PixConfig = {
  keyType: PixKeyType;
  keyValue: string;
  isValidated: boolean;
  validatedAt?: string;
  receiverName?: string;
  receiverInstitution?: string;
  receiverType?: string;
  updatedAt: string;
  updatedBy: string;
};

export type PayoutSettings = {
  bankAccount: BankAccountConfig;
  pix: PixConfig;
};

export const PAYOUT_UPDATED_EVENT = 'marthi-payout-updated';
export const INITIAL_PAYOUT_SETTINGS: PayoutSettings = {
  bankAccount: { bankCode: '', bankName: '', agency: '', accountNumber: '', accountType: 'corrente',
    holderName: '', holderDocument: '', validationStatus: 'pendente', updatedAt: '', updatedBy: '' },
  pix: { keyType: 'email', keyValue: '', isValidated: false, updatedAt: '', updatedBy: '' },
};
let memorySettings: PayoutSettings | null = null;
function accept(raw: Partial<PayoutSettings>): PayoutSettings {
  memorySettings = {
    bankAccount: { ...INITIAL_PAYOUT_SETTINGS.bankAccount, ...raw.bankAccount },
    pix: { ...INITIAL_PAYOUT_SETTINGS.pix, ...raw.pix },
  };
  window.dispatchEvent(new Event(PAYOUT_UPDATED_EVENT));
  return memorySettings;
}
export function getPayoutSettings(): PayoutSettings { return memorySettings ?? structuredClone(INITIAL_PAYOUT_SETTINGS); }
export async function hydratePayoutSettings() { return accept(await nestGet<PayoutSettings>('/admin/payout-settings')); }
export async function updateBankAccount(data: Partial<BankAccountConfig>, actor?: { name: string; email: string }) {
  const saved = accept(await nestPut<PayoutSettings>('/admin/payout-settings/bank', data));
  logAudit({ kind: 'action', actorName: actor?.name ?? '', actorEmail: actor?.email ?? '',
    action: 'Conta bancária salva no MarthiDB', detail: saved.bankAccount.bankName, path: '/admin/recebimentos' });
  return saved.bankAccount;
}
export type PixValidationResult = { success: boolean; message: string };
/** Valida exclusivamente o formato; confirmação bancária depende de um provedor. */
export function validatePixKey(keyType: PixKeyType, keyValue: string): PixValidationResult {
  const key = keyValue.trim(); const digits = key.replace(/\D/g, '');
  const valid = keyType === 'email' ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)
    : keyType === 'cpf_cnpj' ? [11, 14].includes(digits.length)
    : keyType === 'telefone' ? /^\+?[\d ()-]+$/.test(key) && digits.length >= 10 && digits.length <= 13
    : /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(key);
  return { success: valid, message: valid ? 'Formato válido. A titularidade da chave não foi confirmada pelo banco.' : 'Formato da chave Pix inválido.' };
}
export async function updatePixConfig(keyType: PixKeyType, keyValue: string,
  _validationData?: { receiverName: string; receiverInstitution: string; receiverType: string },
  actor?: { name: string; email: string }) {
  const saved = accept(await nestPut<PayoutSettings>('/admin/payout-settings/pix', { keyType, keyValue }));
  logAudit({ kind: 'action', actorName: actor?.name ?? '', actorEmail: actor?.email ?? '',
    action: 'Chave Pix salva no MarthiDB', detail: keyType, path: '/admin/recebimentos' });
  return saved.pix;
}
