export type TotemBrand = 'apple' | 'xiaomi' | 'other';

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

export const PAYMENT_OPTIONS = ['À vista', 'Parcelado'] as const;
export const INSTALLMENTS = ['2x', '3x', '6x', '10x', '12x'] as const;

export function formatBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
