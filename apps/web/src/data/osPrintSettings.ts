import { useEffect, useState } from 'react';
import { getFiscalIssuerSettings } from './fiscalIssuerStore';
import { getTotemSettings } from './totemSettings';
import { getActiveStore } from './multiStoreStore';
import { readModuleState, loadModuleState, saveModuleState } from './moduleState';

export const OS_PRINT_SETTINGS_EVENT = 'marthi-os-print-settings-updated';

export type OsPrintModel = 'default' | 'commercial';
export type OsPasswordType = 'typed' | 'pattern' | 'none';

export type CompanyPrintData = {
  name: string;
  tradeName: string;
  document: string;
  ie: string;
  im: string;
  address: string;
  neighborhood: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  logoUrl: string;
};

export type QrCodePrintData = {
  enabled: boolean;
  url: string;
  label: string;
};

export type WarrantyPrintDefaults = {
  defaultDays: number;
  termsText: string;
};

export type OsPrintSettings = {
  model: OsPrintModel;
  company: CompanyPrintData;
  qrCode: QrCodePrintData;
  warranty: WarrantyPrintDefaults;
  copies: 'both' | 'customer' | 'shop';
  updatedAt: string;
};

export const DEFAULT_WARRANTY_TERMS = `1. OBS: GARANTIA NÃO COBRE MAU USO, APARELHO MOLHADO, APARELHO QUEBRADO OU DANOS FÍSICOS/QUÍMICOS.
2. Prazo para retirada: O cliente tem o prazo de até 90 dias corridos a partir da data de entrada do aparelho para retirar o mesmo, sem aplicação de taxas adicionais.
3. Taxa de armazenamento: Caso o aparelho não seja retirado no prazo estipulado, poderá incidir taxa de custódia e guarda.
4. Descartes e sucata: Aparelhos não retirados após notificação poderão ser desfeitos ou destinados para ressarcimento de peças e custos de bancada.
5. Responsabilidade: A empresa compromete-se com a perfeita execução técnica dos serviços discriminados e peças substituídas de acordo com os prazos aqui expressos.`;

export function getDefaultCompanyData(): CompanyPrintData {
  const fiscal = getFiscalIssuerSettings();
  const totem = getTotemSettings();
  const store = getActiveStore();

  const name = fiscal.emitenteName || totem.storeName || store?.tradeName || store?.name || '';
  const tradeName = totem.storeName || fiscal.emitenteName || store?.tradeName || store?.name || '';
  const document = fiscal.cnpj || '';
  const ie = fiscal.ie || '';
  const im = fiscal.im || '';
  const address = totem.locationLabel || [store?.street, store?.number, store?.complement].filter(Boolean).join(', ');
  const neighborhood = store?.neighborhood || '';
  const city = fiscal.municipio || store?.city || '';
  const state = fiscal.uf || store?.state || '';
  const zip = '';
  const phone = store?.phone || totem.storeWhatsApp || '';
  const email = store?.email || '';
  const logoUrl = totem.storeLogo || '';

  return {
    name,
    tradeName,
    document,
    ie,
    im,
    address,
    neighborhood,
    city,
    state,
    zip,
    phone,
    email,
    logoUrl,
  };
}

export function defaultOsPrintSettings(): OsPrintSettings {
  return {
    model: 'commercial',
    company: getDefaultCompanyData(),
    qrCode: {
      enabled: false,
      url: '',
      label: '',
    },
    warranty: {
      defaultDays: 90,
      termsText: DEFAULT_WARRANTY_TERMS,
    },
    copies: 'both',
    updatedAt: new Date().toISOString(),
  };
}

export function getOsPrintSettings(): OsPrintSettings {
  return readModuleState('os-print-settings', defaultOsPrintSettings());
}

export async function saveOsPrintSettings(patch: Partial<OsPrintSettings>): Promise<OsPrintSettings> {
  const current = getOsPrintSettings();
  const next: OsPrintSettings = {
    ...current,
    ...patch,
    company: {
      ...current.company,
      ...(patch.company || {}),
    },
    qrCode: {
      ...current.qrCode,
      ...(patch.qrCode || {}),
    },
    warranty: {
      ...current.warranty,
      ...(patch.warranty || {}),
    },
    updatedAt: new Date().toISOString(),
  };

  await saveModuleState('os-print-settings', next);
  window.dispatchEvent(new CustomEvent(OS_PRINT_SETTINGS_EVENT, { detail: next }));
  return next;
}

export function useOsPrintSettings(): [OsPrintSettings, (patch: Partial<OsPrintSettings>) => Promise<OsPrintSettings>] {
  const [settings, setSettings] = useState<OsPrintSettings>(getOsPrintSettings);

  useEffect(() => {
    function handleChange() {
      setSettings(getOsPrintSettings());
    }
    window.addEventListener(OS_PRINT_SETTINGS_EVENT, handleChange);
    return () => window.removeEventListener(OS_PRINT_SETTINGS_EVENT, handleChange);
  }, []);

  return [settings, saveOsPrintSettings];
}

export async function hydrateOsPrintSettingsFromApi() { await loadModuleState('os-print-settings', defaultOsPrintSettings()); window.dispatchEvent(new Event(OS_PRINT_SETTINGS_EVENT)); }
