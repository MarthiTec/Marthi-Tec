import { useEffect, useState } from 'react';
import type { PartnerModuleId } from './catalog';

export type StoreSegmentId =
  | 'assistencia_tecnica'
  | 'vestuario_moda'
  | 'restaurante_gastronomia'
  | 'varejo_geral'
  | 'prestador_servicos'
  | 'personalizado';

export type StoreCustomization = {
  segmentId: StoreSegmentId;
  segmentName: string;
  showImei: boolean;
  showDevicePassword: boolean;
  showTablesAndKitchen: boolean;
  showTechnicalBench: boolean;
  showSizeColorGrid: boolean;
  updatedAt: string;
};

export type SegmentPreset = {
  id: StoreSegmentId;
  name: string;
  icon: string;
  badge: string;
  description: string;
  recommendedModules: PartnerModuleId[];
  config: Omit<StoreCustomization, 'segmentId' | 'segmentName' | 'updatedAt'>;
};

export const SEGMENT_PRESETS: SegmentPreset[] = [
  {
    id: 'assistencia_tecnica',
    name: 'Oficina, Assistência Técnica & Acessórios',
    icon: '🔧',
    badge: 'Eletrônicos & Reparos',
    description:
      'Smartphones, computadores e eletrônicos. Ativa IMEI/Série obrigatório, senhas de desbloqueio para teste e bancada técnica.',
    recommendedModules: ['os', 'erp'],
    config: {
      showImei: true,
      showDevicePassword: true,
      showTablesAndKitchen: false,
      showTechnicalBench: true,
      showSizeColorGrid: false,
    },
  },
  {
    id: 'vestuario_moda',
    name: 'Moda, Vestuário & Calçados',
    icon: '👗',
    badge: 'Moda & Roupas',
    description:
      'Lojas de roupas, calçados e acessórios. Ativa grade de tamanhos e cores no catálogo e PDV. Oculta IMEI, senhas e mesas/cozinha.',
    recommendedModules: ['erp', 'ecommerce'],
    config: {
      showImei: false,
      showDevicePassword: false,
      showTablesAndKitchen: false,
      showTechnicalBench: false,
      showSizeColorGrid: true,
    },
  },
  {
    id: 'restaurante_gastronomia',
    name: 'Restaurante, Bar & Gastronomia',
    icon: '🍔',
    badge: 'Alimentação & Bebidas',
    description:
      'Bares, lanchonetes, restaurantes e cafeterias. Ativa mesas, pedidos por comanda e tela de cozinha. Oculta IMEI e senhas de aparelhos.',
    recommendedModules: ['totem', 'erp'],
    config: {
      showImei: false,
      showDevicePassword: false,
      showTablesAndKitchen: true,
      showTechnicalBench: false,
      showSizeColorGrid: false,
    },
  },
  {
    id: 'varejo_geral',
    name: 'Varejo Geral, Mercado & Utilidades',
    icon: '🛒',
    badge: 'Comércio de Balcão',
    description:
      'Comércio de prateleira, mercados, papelarias e utilidades. Foco em frente de caixa ágil. Oculta mesas e IMEI.',
    recommendedModules: ['erp', 'fiscal'],
    config: {
      showImei: false,
      showDevicePassword: false,
      showTablesAndKitchen: false,
      showTechnicalBench: false,
      showSizeColorGrid: false,
    },
  },
  {
    id: 'prestador_servicos',
    name: 'Prestação de Serviços Gerais',
    icon: '📋',
    badge: 'Serviços & Reparos Gerais',
    description:
      'Empresas de serviços, montagens, marcenarias e orçamentos comerciais. Oculta mesas/cozinha e IMEI de eletrônicos.',
    recommendedModules: ['os', 'erp'],
    config: {
      showImei: false,
      showDevicePassword: false,
      showTablesAndKitchen: false,
      showTechnicalBench: true,
      showSizeColorGrid: false,
    },
  },
  {
    id: 'personalizado',
    name: 'Personalizado',
    icon: '⚙️',
    badge: 'Ajuste Fino',
    description:
      'Defina você mesmo quais campos e módulos ficam visíveis na sua loja conforme a sua necessidade específica.',
    recommendedModules: ['totem', 'erp', 'os'],
    config: {
      showImei: true,
      showDevicePassword: true,
      showTablesAndKitchen: true,
      showTechnicalBench: true,
      showSizeColorGrid: true,
    },
  },
];

const STORAGE_KEY = 'marthi.store.segment_config';
export const SEGMENT_UPDATED_EVENT = 'marthi-segment-updated';

export function defaultStoreCustomization(): StoreCustomization {
  const defaultPreset = SEGMENT_PRESETS[0]; // Assistência Técnica padrão
  return {
    segmentId: defaultPreset.id,
    segmentName: defaultPreset.name,
    ...defaultPreset.config,
    updatedAt: new Date().toISOString(),
  };
}

export function getStoreCustomization(): StoreCustomization {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultStoreCustomization();
    const parsed = JSON.parse(raw);
    return {
      ...defaultStoreCustomization(),
      ...parsed,
    };
  } catch {
    return defaultStoreCustomization();
  }
}

export function saveStoreCustomization(next: Partial<StoreCustomization>): StoreCustomization {
  const current = getStoreCustomization();
  const updated: StoreCustomization = {
    ...current,
    ...next,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  window.dispatchEvent(new CustomEvent(SEGMENT_UPDATED_EVENT, { detail: updated }));
  return updated;
}

export function applySegmentPreset(segmentId: StoreSegmentId): StoreCustomization {
  const preset = SEGMENT_PRESETS.find((p) => p.id === segmentId) || SEGMENT_PRESETS[0];
  return saveStoreCustomization({
    segmentId: preset.id,
    segmentName: preset.name,
    ...preset.config,
  });
}

export function useStoreCustomization() {
  const [customization, setCustomization] = useState<StoreCustomization>(getStoreCustomization);

  useEffect(() => {
    function handleUpdate() {
      setCustomization(getStoreCustomization());
    }
    window.addEventListener(SEGMENT_UPDATED_EVENT, handleUpdate);
    return () => window.removeEventListener(SEGMENT_UPDATED_EVENT, handleUpdate);
  }, []);

  return customization;
}
