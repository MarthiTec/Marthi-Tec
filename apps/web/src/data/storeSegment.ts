import { useEffect, useState } from 'react';

export type StoreSegmentId =
  | 'assistencia_tecnica'
  | 'restaurante_gastronomia'
  | 'vestuario_moda'
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
  description: string;
  config: Omit<StoreCustomization, 'segmentId' | 'segmentName' | 'updatedAt'>;
};

export const SEGMENT_PRESETS: SegmentPreset[] = [
  {
    id: 'assistencia_tecnica',
    name: 'Assistência Técnica & Eletrônicos',
    icon: '🔧',
    description: 'Smartphones, computadores e eletrônicos. Exibe IMEI/série, senhas e bancada técnica de testes.',
    config: {
      showImei: true,
      showDevicePassword: true,
      showTablesAndKitchen: false,
      showTechnicalBench: true,
      showSizeColorGrid: false,
    },
  },
  {
    id: 'restaurante_gastronomia',
    name: 'Restaurante, Bar & Gastronomia',
    icon: '🍔',
    description: 'Alimentação e bebidas. Ativa sistema de mesas e cozinha; oculta IMEI e senhas de aparelhos.',
    config: {
      showImei: false,
      showDevicePassword: false,
      showTablesAndKitchen: true,
      showTechnicalBench: false,
      showSizeColorGrid: false,
    },
  },
  {
    id: 'vestuario_moda',
    name: 'Loja de Roupas, Calçados & Moda',
    icon: '👗',
    description: 'Varejo de vestuário e calçados. Oculta mesas/cozinha e IMEI; ativa grade de tamanhos e cores.',
    config: {
      showImei: false,
      showDevicePassword: false,
      showTablesAndKitchen: false,
      showTechnicalBench: false,
      showSizeColorGrid: true,
    },
  },
  {
    id: 'varejo_geral',
    name: 'Varejo Geral, Mercado & Utilidades',
    icon: '🛒',
    description: 'Comércio geral, produtos de prateleira e distribuição. Oculta mesas e IMEI.',
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
    description: 'Empresas de serviços em geral, reparos e orçamentos comerciais. Oculta mesas e IMEI.',
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
    description: 'Controle manual dos campos e módulos conforme a necessidade específica da sua empresa.',
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
