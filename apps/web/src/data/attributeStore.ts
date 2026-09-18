export const ATTR_COR = 'ATTR-COR';
export const ATTR_CAP = 'ATTR-CAP';
export const ATTR_RET = 'ATTR-RET';
export const MAX_ATTRIBUTES = 5;

export type ProductAttribute = {
  id: string;
  name: string;
  values: string[];
  priceDeltas: Record<string, number>;
  useOnTotem: boolean;
  filterOnTotem: boolean;
  useOnStock: boolean;
  sort: number;
  active: boolean;
};

export type PickedAttribute = {
  id: string;
  name: string;
  value: string;
};

const STORAGE_KEY = 'marthi.attributes.v1';
export const ATTRIBUTES_EVENT = 'marthi-attributes-updated';

export function seedAttributes(): ProductAttribute[] {
  return [
    {
      id: ATTR_COR,
      name: 'Cor',
      values: ['Desert', 'Preto', 'Branco', 'Natural', 'Azul', 'Rosa', 'Roxo', 'Verde', 'Vermelho'],
      priceDeltas: {},
      useOnTotem: true,
      filterOnTotem: true,
      useOnStock: true,
      sort: 1,
      active: true,
    },
    {
      id: ATTR_CAP,
      name: 'Capacidade',
      values: ['64 GB', '128 GB', '256 GB', '512 GB'],
      priceDeltas: {},
      useOnTotem: true,
      filterOnTotem: true,
      useOnStock: true,
      sort: 2,
      active: true,
    },
    {
      id: ATTR_RET,
      name: 'Retirada',
      values: ['Pronta entrega', 'Por encomenda'],
      priceDeltas: { 'Pronta entrega': 0, 'Por encomenda': 250 },
      useOnTotem: true,
      filterOnTotem: false,
      useOnStock: false,
      sort: 3,
      active: true,
    },
  ];
}

function sortAttrs(items: ProductAttribute[]) {
  return [...items].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'pt-BR'));
}

function load(): ProductAttribute[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const fresh = seedAttributes();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      return fresh;
    }
    const parsed = JSON.parse(raw) as ProductAttribute[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const fresh = seedAttributes();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      return fresh;
    }
    const next = sortAttrs(
      parsed.map((item, index) => {
        const values = Array.isArray(item.values) ? item.values.filter(Boolean) : [];
        const priceDeltas = { ...(item.priceDeltas ?? {}) };
        if (item.id === ATTR_RET && priceDeltas['Por encomenda'] === undefined) {
          priceDeltas['Pronta entrega'] = priceDeltas['Pronta entrega'] ?? 0;
          priceDeltas['Por encomenda'] = 250;
        }
        return {
          ...item,
          values,
          priceDeltas,
          useOnTotem: Boolean(item.useOnTotem),
          filterOnTotem: Boolean(item.filterOnTotem),
          useOnStock: Boolean(item.useOnStock),
          sort: item.sort ?? index + 1,
          active: item.active !== false,
        };
      }),
    );
    const rawRet = parsed.find((item) => item.id === ATTR_RET);
    if (rawRet && rawRet.priceDeltas?.['Por encomenda'] === undefined) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
    return next;
  } catch {
    return seedAttributes();
  }
}

function persist(items: ProductAttribute[]) {
  const next = sortAttrs(items);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(ATTRIBUTES_EVENT));
  return next;
}

export function getAttributes() {
  return load();
}

export function saveAttributes(items: ProductAttribute[]) {
  return persist(items.slice(0, MAX_ATTRIBUTES));
}

export function totemAttributes() {
  return load()
    .filter((item) => item.active && item.useOnTotem)
    .slice(0, MAX_ATTRIBUTES);
}

export function totemFilterAttributes() {
  return load()
    .filter((item) => item.active && item.filterOnTotem)
    .slice(0, MAX_ATTRIBUTES);
}

export function stockAttributes() {
  return load()
    .filter((item) => item.active && item.useOnStock)
    .slice(0, MAX_ATTRIBUTES);
}

export function productAttrValues(
  product: { attrs?: Record<string, string[]>; colors?: string[]; storages?: string[] },
  attr: ProductAttribute,
) {
  const mapped = product.attrs?.[attr.id];
  if (mapped?.length) return mapped;
  const name = attr.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (name.includes('cor') && product.colors?.length) return product.colors;
  if ((name.includes('capac') || name.includes('armazen')) && product.storages?.length) {
    return product.storages;
  }
  if (name.includes('retir') || attr.id === ATTR_RET) {
    return product.attrs?.[attr.id] ?? ['Pronta entrega', 'Por encomenda'];
  }
  return [];
}

export function toLegacyFields(picked: PickedAttribute[]) {
  const find = (...needles: string[]) =>
    picked.find((item) =>
      needles.some((needle) => item.name.toLowerCase().includes(needle)),
    )?.value ?? '';
  return {
    color: find('cor', 'color', 'armac') || picked[0]?.value || '-',
    storage: find('capac', 'tamanho', 'size', 'lente', 'modelo') || picked[1]?.value || '-',
    fulfillment: find('retir', 'entrega') || picked[2]?.value || '-',
  };
}

export function formatPicked(picked: PickedAttribute[]) {
  return picked
    .filter((item) => item.value)
    .map((item) => item.value)
    .join(' · ');
}
