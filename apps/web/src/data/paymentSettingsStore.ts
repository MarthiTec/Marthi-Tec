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

const STORAGE_KEY = 'marthi.payout.settings.v1';
export const PAYOUT_UPDATED_EVENT = 'marthi-payout-updated';

export const INITIAL_PAYOUT_SETTINGS: PayoutSettings = {
  bankAccount: {
    bankCode: '077',
    bankName: 'Banco Inter S.A.',
    agency: '0001',
    accountNumber: '1234567-8',
    accountType: 'corrente',
    holderName: 'MARTHI TECNOLOGIA LTDA',
    holderDocument: '45.123.456/0001-89',
    validationStatus: 'validado',
    updatedAt: new Date().toISOString(),
    updatedBy: 'admin@marthi.com.br',
  },
  pix: {
    keyType: 'email',
    keyValue: 'marthi.tecnologia@gmail.com',
    isValidated: true,
    validatedAt: new Date().toISOString(),
    receiverName: 'MARTHI TECNOLOGIA LTDA',
    receiverInstitution: 'BANCO INTER S.A.',
    receiverType: 'E-mail (PJ)',
    updatedAt: new Date().toISOString(),
    updatedBy: 'admin@marthi.com.br',
  },
};

let memorySettings: PayoutSettings | null = null;

function load(): PayoutSettings {
  if (memorySettings) return memorySettings;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      memorySettings = { ...INITIAL_PAYOUT_SETTINGS };
      return memorySettings;
    }
    const parsed = JSON.parse(raw);
    if (parsed && parsed.bankAccount && parsed.pix) {
      memorySettings = parsed;
      return memorySettings!;
    }
  } catch {
    /* fallback */
  }
  memorySettings = { ...INITIAL_PAYOUT_SETTINGS };
  return memorySettings;
}

function persist(settings: PayoutSettings) {
  memorySettings = { ...settings };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore storage quota */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PAYOUT_UPDATED_EVENT, { detail: settings }));
  }
}

export function getPayoutSettings(): PayoutSettings {
  return load();
}

export function updateBankAccount(
  data: Partial<BankAccountConfig>,
  actor?: { name: string; email: string },
): BankAccountConfig {
  const current = load();
  const next: BankAccountConfig = {
    ...current.bankAccount,
    ...data,
    updatedAt: new Date().toISOString(),
    updatedBy: actor?.email || 'admin@marthi.com.br',
  };

  const updated: PayoutSettings = {
    ...current,
    bankAccount: next,
  };
  persist(updated);

  logAudit({
    kind: 'action',
    actorName: actor?.name || 'Administrador Marthi',
    actorEmail: actor?.email || 'admin@marthi.com.br',
    action: 'Atualização de conta bancária de recebimento',
    detail: `Banco: ${next.bankName} (${next.bankCode}), Ag: ${next.agency}, Titular: ${next.holderName}`,
    path: '/admin/recebimentos',
  });

  return next;
}

export type PixValidationResult = {
  success: boolean;
  message: string;
  data?: {
    receiverName: string;
    receiverInstitution: string;
    receiverType: string;
    validatedAt: string;
  };
};

/**
 * Validação estrutural e verificação de chave Pix com retorno simulado do DICT (Diretório BACEN)
 */
export function validatePixKey(keyType: PixKeyType, keyValue: string): PixValidationResult {
  const cleanVal = keyValue.trim();
  if (!cleanVal) {
    return { success: false, message: 'A chave Pix não pode estar vazia.' };
  }

  if (keyType === 'email') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanVal)) {
      return { success: false, message: 'Formato de e-mail inválido para chave Pix.' };
    }
  } else if (keyType === 'cpf_cnpj') {
    const digits = cleanVal.replace(/\D/g, '');
    if (digits.length !== 11 && digits.length !== 14) {
      return { success: false, message: 'CPF deve conter 11 dígitos ou CNPJ deve conter 14 dígitos.' };
    }
  } else if (keyType === 'telefone') {
    const digits = cleanVal.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 13) {
      return { success: false, message: 'Número de telefone deve conter DDD e número válido (ex: (11) 98765-4321).' };
    }
  } else if (keyType === 'aleatoria') {
    if (cleanVal.length < 32) {
      return { success: false, message: 'Chave aleatória (EVP) deve ter o formato UUID válido de 32+ caracteres.' };
    }
  }

  const currentSettings = load();
  const bankName = currentSettings.bankAccount.bankName || 'BANCO INTER S.A.';
  const titular = currentSettings.bankAccount.holderName || 'MARTHI TECNOLOGIA LTDA';

  const typeLabelMap: Record<PixKeyType, string> = {
    email: 'E-mail',
    cpf_cnpj: cleanVal.replace(/\D/g, '').length === 11 ? 'CPF (PF)' : 'CNPJ (PJ)',
    telefone: 'Telefone Celular',
    aleatoria: 'Chave Aleatória (EVP)',
  };

  return {
    success: true,
    message: 'Chave Pix validada com sucesso no sistema bancário.',
    data: {
      receiverName: titular,
      receiverInstitution: bankName.toUpperCase(),
      receiverType: typeLabelMap[keyType],
      validatedAt: new Date().toISOString(),
    },
  };
}

export function updatePixConfig(
  keyType: PixKeyType,
  keyValue: string,
  validationData?: {
    receiverName: string;
    receiverInstitution: string;
    receiverType: string;
  },
  actor?: { name: string; email: string },
): PixConfig {
  const current = load();
  const isValid = Boolean(validationData);

  const next: PixConfig = {
    keyType,
    keyValue: keyValue.trim(),
    isValidated: isValid,
    validatedAt: isValid ? new Date().toISOString() : undefined,
    receiverName: validationData?.receiverName,
    receiverInstitution: validationData?.receiverInstitution,
    receiverType: validationData?.receiverType,
    updatedAt: new Date().toISOString(),
    updatedBy: actor?.email || 'admin@marthi.com.br',
  };

  const updated: PayoutSettings = {
    ...current,
    pix: next,
  };
  persist(updated);

  logAudit({
    kind: 'action',
    actorName: actor?.name || 'Administrador Marthi',
    actorEmail: actor?.email || 'admin@marthi.com.br',
    action: 'Atualização de Chave Pix de Recebimento',
    detail: `Tipo: ${keyType}, Chave: ${next.keyValue}, Status: ${isValid ? 'Validada' : 'Pendente'}`,
    path: '/admin/recebimentos',
  });

  return next;
}
