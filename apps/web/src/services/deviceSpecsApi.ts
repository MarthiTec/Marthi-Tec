import { nestGet } from './nestClient';
import type { ProductSpec } from '../components/ProductSpecsPanel';

/** Ficha técnica sugerida pelo nome do produto (Apple oficial / API de aparelhos da loja). */
export type DeviceSpecsSuggestion = { found: boolean; model?: string; source?: string; sourceUrl?: string; message?: string; specs: ProductSpec[] };

export const apiSuggestDeviceSpecs = (name: string, brand = '') =>
  nestGet<DeviceSpecsSuggestion>(`/device-reference/specs?name=${encodeURIComponent(name)}&brand=${encodeURIComponent(brand)}`);
