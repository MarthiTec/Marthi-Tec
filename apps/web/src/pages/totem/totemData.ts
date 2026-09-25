import { ATTR_CAP, ATTR_COR, ATTR_RET } from '../../data/attributeStore';

export type TotemBrand = 'apple' | 'xiaomi';

export type TotemProduct = {
  id: number;
  name: string;
  brand: TotemBrand;
  storages: string[];
  colors: string[];
  cashPrice: number;
  installmentLabel: string;
  images: string[];
  attrs: Record<string, string[]>;
};

export const TOTEM_BRANDS: { id: TotemBrand | 'all'; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'apple', label: 'iPhone' },
  { id: 'xiaomi', label: 'Xiaomi' },
];

export const FULFILLMENT_OPTIONS = ['Pronta entrega', 'Por encomenda'] as const;

export const PAYMENT_OPTIONS = ['À vista', 'Parcelado'] as const;
export const INSTALLMENTS = ['2x', '3x', '6x', '10x', '12x'] as const;

/** Helpers de attr vazios — catálogo vem do estoque Nest (`totemCatalog`). */
export function emptyTotemAttrs(): Record<string, string[]> {
  return {
    [ATTR_COR]: [],
    [ATTR_CAP]: [],
    [ATTR_RET]: [...FULFILLMENT_OPTIONS],
  };
}

export function formatBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
