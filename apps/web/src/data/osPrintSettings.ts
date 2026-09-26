import { useEffect, useState } from 'react';
import { getFiscalIssuerSettings } from './fiscalIssuerStore';
import { getTotemSettings } from './totemSettings';
import { MARTHI_COMPANY } from './companyContact';

const STORAGE_KEY = 'marthi.os.print_settings.v1';
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

  const name = fiscal.emitenteName || totem.storeName || MARTHI_COMPANY.legalName;
  const tradeName = totem.storeName || fiscal.emitenteName || MARTHI_COMPANY.legalName;
  const document = fiscal.cnpj || '61.506.270/0001-63';
  const ie = fiscal.ie || '';
  const im = fiscal.im || '';
  const address = totem.locationLabel || MARTHI_COMPANY.addressLine;
  const neighborhood = MARTHI_COMPANY.district;
  const city = fiscal.municipio || MARTHI_COMPANY.city;
  const state = fiscal.uf || MARTHI_COMPANY.stateUf;
  const zip = '25.812-461';
  const phone = totem.storeWhatsApp ? `(24) ${totem.storeWhatsApp}` : MARTHI_COMPANY.whatsappDisplay;
  const email = MARTHI_COMPANY.email;
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
      enabled: true,
      url: 'https://instagram.com/marthi.tecnologia',
      label: 'Siga nosso Instagram / Avalie nosso atendimento',
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
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultOsPrintSettings();
    const parsed = JSON.parse(raw) as Partial<OsPrintSettings>;
    const defaults = defaultOsPrintSettings();

    return {
      model: parsed.model === 'default' ? 'default' : 'commercial',
      company: {
        ...defaults.company,
        ...(parsed.company || {}),
        // If logo is empty in local settings but exists in totem, use it
        logoUrl: parsed.company?.logoUrl || defaults.company.logoUrl,
      },
      qrCode: {
        ...defaults.qrCode,
        ...(parsed.qrCode || {}),
      },
      warranty: {
        ...defaults.warranty,
        ...(parsed.warranty || {}),
      },
      copies: parsed.copies || 'both',
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch {
    return defaultOsPrintSettings();
  }
}

export function saveOsPrintSettings(patch: Partial<OsPrintSettings>): OsPrintSettings {
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

  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(OS_PRINT_SETTINGS_EVENT, { detail: next }));
  return next;
}

export function useOsPrintSettings(): [OsPrintSettings, (patch: Partial<OsPrintSettings>) => void] {
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
