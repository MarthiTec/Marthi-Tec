export type TotemBrand = 'apple' | 'xiaomi';

export type TotemProduct = {
  id: number;
  name: string;
  brand: TotemBrand;
  storages: string[];
  colors: string[];
  cashPrice: number;
  installmentLabel: string;
  /** Várias fotos por modelo (carrossel do totem) */
  images: string[];
};

export const TOTEM_BRANDS: { id: TotemBrand | 'all'; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'apple', label: 'iPhone' },
  { id: 'xiaomi', label: 'Xiaomi' },
];

function phoneImages(slug: string, count = 4): string[] {
  return Array.from({ length: count }, (_, index) => `/totem/${slug}/${index + 1}.svg`);
}

export const TOTEM_PRODUCTS: TotemProduct[] = [
  {
    id: 1,
    name: 'iPhone 16 Pro Max',
    brand: 'apple',
    storages: ['128 GB', '256 GB', '512 GB'],
    colors: ['Preto', 'Branco', 'Desert', 'Natural'],
    cashPrice: 8999,
    installmentLabel: '12x de R$ 849,00',
    images: phoneImages('iphone-16-pro-max', 5),
  },
  {
    id: 2,
    name: 'iPhone 16 Pro',
    brand: 'apple',
    storages: ['128 GB', '256 GB'],
    colors: ['Preto', 'Branco', 'Desert'],
    cashPrice: 7999,
    installmentLabel: '12x de R$ 749,00',
    images: phoneImages('iphone-16-pro', 4),
  },
  {
    id: 3,
    name: 'iPhone 15',
    brand: 'apple',
    storages: ['128 GB', '256 GB'],
    colors: ['Preto', 'Azul', 'Rosa'],
    cashPrice: 4499,
    installmentLabel: '12x de R$ 419,00',
    images: phoneImages('iphone-15', 4),
  },
  {
    id: 4,
    name: 'iPhone 14',
    brand: 'apple',
    storages: ['128 GB', '256 GB'],
    colors: ['Preto', 'Azul', 'Roxo'],
    cashPrice: 3899,
    installmentLabel: '12x de R$ 365,00',
    images: phoneImages('iphone-14', 4),
  },
  {
    id: 5,
    name: 'iPhone 13',
    brand: 'apple',
    storages: ['128 GB', '256 GB'],
    colors: ['Preto', 'Branco', 'Azul'],
    cashPrice: 3400,
    installmentLabel: '12x de R$ 355,00',
    images: phoneImages('iphone-13', 4),
  },
  {
    id: 6,
    name: 'iPhone 12',
    brand: 'apple',
    storages: ['64 GB', '128 GB'],
    colors: ['Preto', 'Branco', 'Azul'],
    cashPrice: 2799,
    installmentLabel: '12x de R$ 265,00',
    images: phoneImages('iphone-12', 3),
  },
  {
    id: 7,
    name: 'iPhone 11',
    brand: 'apple',
    storages: ['64 GB', '128 GB'],
    colors: ['Preto', 'Branco', 'Vermelho'],
    cashPrice: 2299,
    installmentLabel: '12x de R$ 219,00',
    images: phoneImages('iphone-11', 3),
  },
  {
    id: 19,
    name: 'Redmi Note 13 Pro',
    brand: 'xiaomi',
    storages: ['256 GB', '512 GB'],
    colors: ['Preto', 'Verde', 'Roxo'],
    cashPrice: 2199,
    installmentLabel: '12x de R$ 209,00',
    images: phoneImages('redmi-note-13-pro', 4),
  },
];

export const FULFILLMENT_OPTIONS = ['À pronta entrega', 'Por encomenda'] as const;
export const PAYMENT_OPTIONS = ['À vista', 'Parcelado'] as const;
export const INSTALLMENTS = ['2x', '3x', '6x', '10x', '12x'] as const;

export function formatBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
