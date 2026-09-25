export const ATTR_COR = 'ATTR-COR';
export const ATTR_CAP = 'ATTR-CAP';
export const ATTR_RET = 'ATTR-RET';
export const ATTR_TAM = 'ATTR-TAM';
export const MAX_ATTRIBUTES = 5;

/** Presets prontos para atributo Tamanho (roupa / calçado). */
export const SIZE_VALUE_PRESETS: { id: string; label: string; values: string[] }[] = [
  {
    id: 'vest-letras',
    label: 'Vestuário (PP–XG)',
    values: ['PP', 'P', 'M', 'G', 'GG', 'XG'],
  },
  {
    id: 'vest-num',
    label: 'Vestuário (36–50)',
    values: ['36', '38', '40', '42', '44', '46', '48', '50'],
  },
  {
    id: 'calcados',
    label: 'Calçados (33–45)',
    values: ['33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45'],
  },
  {
    id: 'infantil',
    label: 'Infantil (2–16)',
    values: ['2', '4', '6', '8', '10', '12', '14', '16'],
  },
];

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

let memoryAttrs: ProductAttribute[] | null = null;

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
    {
      id: ATTR_TAM,
      name: 'Tamanho',
      values: [...SIZE_VALUE_PRESETS[0].values],
      priceDeltas: {},
      useOnTotem: true,
      filterOnTotem: true,
      useOnStock: true,
      sort: 4,
      active: true,
    },
  ];
}

function sortAttrs(items: ProductAttribute[]) {
  return [...items].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'pt-BR'));
}

function load(): ProductAttribute[] {
  if (memoryAttrs) {
    return sortAttrs(
      memoryAttrs.map((item) => ({
        ...item,
        values: [...item.values],
        priceDeltas: { ...item.priceDeltas },
      })),
    );
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Sem seed automático — totem/ERP hidratam via Nest.
      return [];
    }
    const parsed = JSON.parse(raw) as ProductAttribute[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [];
    }
    return sortAttrs(
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
  } catch {
    return [];
  }
}

function persist(items: ProductAttribute[]) {
  const next = sortAttrs(items);
  memoryAttrs = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(ATTRIBUTES_EVENT));
  return next;
}

export function replaceAttributes(items: ProductAttribute[]) {
  return persist(items.slice(0, MAX_ATTRIBUTES));
}

/** Hidrata atributos do Nest (público no totem ou autenticado no painel). */
export async function hydrateAttributesFromApi() {
  const { isNestAuthed } = await import('../services/nestClient');
  const { apiGetTotemPublicAttributes, apiListAttributes } = await import('../services/erpApi');
  const remote = isNestAuthed()
    ? await apiListAttributes().catch(() => apiGetTotemPublicAttributes())
    : await apiGetTotemPublicAttributes();
  return replaceAttributes(remote);
}

export function getAttributes() {
  return load();
}

export async function saveAttributes(items: ProductAttribute[]) {
  const { isNestAuthed } = await import('../services/nestClient');
  if (isNestAuthed()) {
    const {
      apiCreateAttribute,
      apiDeleteAttribute,
      apiListAttributes,
      apiUpdateAttribute,
    } = await import('../services/erpApi');
    const current = await apiListAttributes();
    const next = items.slice(0, MAX_ATTRIBUTES);
    const nextIds = new Set(next.map((item) => item.id).filter(Boolean));
    for (const old of current) {
      if (!nextIds.has(old.id)) await apiDeleteAttribute(old.id);
    }
    const saved: ProductAttribute[] = [];
    for (const item of next) {
      const body = {
        name: item.name,
        values: item.values,
        priceDeltas: item.priceDeltas,
        useOnTotem: item.useOnTotem,
        filterOnTotem: item.filterOnTotem,
        useOnStock: item.useOnStock,
        sort: item.sort,
        active: item.active,
      };
      if (current.some((row) => row.id === item.id)) {
        saved.push(await apiUpdateAttribute(item.id, body));
      } else {
        saved.push(await apiCreateAttribute(body));
      }
    }
    return persist(saved);
  }
  return persist(items.slice(0, MAX_ATTRIBUTES));
}

export async function removeAttribute(id: string) {
  const { isNestAuthed } = await import('../services/nestClient');
  if (isNestAuthed()) {
    const { apiDeleteAttribute } = await import('../services/erpApi');
    await apiDeleteAttribute(id);
  }
  return persist(load().filter((item) => item.id !== id).slice(0, MAX_ATTRIBUTES));
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

/** Opções do picker no card: valores do produto, senão os valores cadastrados no atributo. */
export function resolveTotemAttrOptions(
  product: { attrs?: Record<string, string[]>; colors?: string[]; storages?: string[] },
  attr: ProductAttribute,
) {
  const fromProduct = productAttrValues(product, attr);
  if (fromProduct.length) return fromProduct;
  return (attr.values ?? []).filter(Boolean);
}

/** Atributos que aparecem no card (totem + filtro). */
export function totemCardAttributes() {
  const byId = new Map<string, ProductAttribute>();
  for (const item of load()) {
    if (!item.active) continue;
    if (!item.useOnTotem && !item.filterOnTotem) continue;
    byId.set(item.id, item);
  }
  return sortAttrs([...byId.values()]).slice(0, MAX_ATTRIBUTES);
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
