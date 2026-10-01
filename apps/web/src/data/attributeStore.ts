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
  return [];
}

export function clearAttributes(): ProductAttribute[] {
  memoryAttrs = [];
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(ATTRIBUTES_EVENT));
  }
  return [];
}

const IGNORED_ATTR_NAMES = new Set(['MAIS UM TESTE PAPAI', 'TESTE']);

function isCleanAttr(item: unknown): item is ProductAttribute {
  if (!item || typeof item !== 'object') return false;
  const name = String((item as ProductAttribute).name || '').trim().toUpperCase();
  return !IGNORED_ATTR_NAMES.has(name);
}

function sortAttrs(items: ProductAttribute[]) {
  if (!Array.isArray(items)) return [];
  return [...items]
    .filter(isCleanAttr)
    .sort(
      (a, b) =>
        (Number(a.sort) || 0) - (Number(b.sort) || 0) ||
        String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'),
    );
}

function load(): ProductAttribute[] {
  if (memoryAttrs) {
    return sortAttrs(
      memoryAttrs
        .filter((item): item is ProductAttribute => Boolean(item && typeof item === 'object'))
        .map((item) => ({
          ...item,
          values: Array.isArray(item.values) ? item.values.filter(Boolean) : [],
          priceDeltas: { ...(item.priceDeltas ?? {}) },
        })),
    );
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [];
    }
    return sortAttrs(
      parsed
        .filter((item): item is ProductAttribute => Boolean(item && typeof item === 'object'))
        .map((item, index) => {
          const values = Array.isArray(item.values) ? item.values.filter(Boolean) : [];
          const priceDeltas = { ...(item.priceDeltas ?? {}) };
          return {
            id: String(item.id || `ATTR-${index}`),
            name: String(item.name || ''),
            values,
            priceDeltas,
            useOnTotem: Boolean(item.useOnTotem),
            filterOnTotem: Boolean(item.filterOnTotem),
            useOnStock: Boolean(item.useOnStock),
            sort: Number(item.sort) || index + 1,
            active: item.active !== false,
          };
        }),
    );
  } catch (err) {
    console.warn('[attributeStore] Erro ao carregar atributos locais, resetando:', err);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return [];
  }
}

function persist(items: ProductAttribute[]) {
  const safeItems = Array.isArray(items) ? items : [];
  const next = sortAttrs(safeItems);
  memoryAttrs = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(ATTRIBUTES_EVENT));
  }
  return next;
}

export function replaceAttributes(items: ProductAttribute[]) {
  const safeItems = Array.isArray(items) ? items : [];
  return persist(safeItems.slice(0, MAX_ATTRIBUTES));
}

/** Hidrata atributos do Nest (público no totem ou autenticado no painel). */
export async function hydrateAttributesFromApi(): Promise<ProductAttribute[]> {
  try {
    const { isNestAuthed } = await import('../services/nestClient');
    const { apiGetTotemPublicAttributes, apiListAttributes } = await import('../services/erpApi');
    let remote: unknown = null;
    if (isNestAuthed()) {
      try {
        remote = await apiListAttributes();
      } catch {
        remote = await apiGetTotemPublicAttributes().catch(() => null);
      }
    } else {
      remote = await apiGetTotemPublicAttributes().catch(() => null);
    }
    if (Array.isArray(remote)) {
      return replaceAttributes(remote as ProductAttribute[]);
    }
    return load();
  } catch (err) {
    console.warn('[attributeStore] Falha ao hidratar atributos da API:', err);
    return load();
  }
}

export function getAttributes() {
  return load();
}

/** Cria um novo atributo de produto via Nest API (se autenticado) ou armazenamento local. */
export async function createAttribute(payload: Omit<ProductAttribute, 'id'>): Promise<ProductAttribute[]> {
  const { isNestAuthed } = await import('../services/nestClient');
  const current = load();
  if (current.length >= MAX_ATTRIBUTES) {
    throw new Error(`Máximo de ${MAX_ATTRIBUTES} atributos por loja.`);
  }

  if (isNestAuthed()) {
    const { apiCreateAttribute } = await import('../services/erpApi');
    const created = await apiCreateAttribute({
      name: payload.name.trim(),
      values: payload.values,
      priceDeltas: payload.priceDeltas,
      useOnTotem: payload.useOnTotem,
      filterOnTotem: payload.filterOnTotem,
      useOnStock: payload.useOnStock,
      sort: payload.sort ?? current.length + 1,
      active: payload.active,
    });
    return persist([created, ...current.filter((item) => item.id !== created.id)]);
  }

  const localItem: ProductAttribute = {
    ...payload,
    name: payload.name.trim(),
    id: `ATTR-${Date.now().toString(36).toUpperCase()}`,
    sort: payload.sort ?? current.length + 1,
  };
  return persist([localItem, ...current]);
}

/** Atualiza um atributo existente via Nest API ou armazenamento local. */
export async function updateAttribute(
  id: string,
  payload: Partial<Omit<ProductAttribute, 'id'>>,
): Promise<ProductAttribute[]> {
  const { isNestAuthed } = await import('../services/nestClient');
  const current = load();

  if (isNestAuthed()) {
    const { apiUpdateAttribute } = await import('../services/erpApi');
    const updated = await apiUpdateAttribute(id, payload);
    return persist(current.map((item) => (item.id === id ? updated : item)));
  }

  return persist(
    current.map((item) => (item.id === id ? { ...item, ...payload } : item)),
  );
}

export async function saveAttributes(items: ProductAttribute[]) {
  const { isNestAuthed } = await import('../services/nestClient');
  if (isNestAuthed()) {
    try {
      const {
        apiCreateAttribute,
        apiListAttributes,
        apiUpdateAttribute,
      } = await import('../services/erpApi');
      const current = await apiListAttributes();
      const next = items.slice(0, MAX_ATTRIBUTES);
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
      const nextIds = new Set(saved.map((item) => item.id));
      const merged = [...saved];
      for (const old of current) {
        if (!nextIds.has(old.id)) {
          merged.push(old);
        }
      }
      return persist(merged);
    } catch (err) {
      console.warn('[attributeStore] Falha ao sincronizar atributos com Nest, gravando localmente:', err);
    }
  }
  return persist(items.slice(0, MAX_ATTRIBUTES));
}

export async function removeAttribute(id: string): Promise<ProductAttribute[]> {
  const { isNestAuthed } = await import('../services/nestClient');
  if (isNestAuthed()) {
    const { apiDeleteAttribute } = await import('../services/erpApi');
    try {
      await apiDeleteAttribute(id);
    } catch (err: unknown) {
      console.warn('[attributeStore] Aviso ao excluir atributo no backend:', err);
    }
  }
  return persist(load().filter((item) => item && item.id !== id).slice(0, MAX_ATTRIBUTES));
}

export function totemAttributes() {
  return load()
    .filter((item) => item && item.active && item.useOnTotem)
    .slice(0, MAX_ATTRIBUTES);
}

export function totemFilterAttributes() {
  return load()
    .filter((item) => item && item.active && item.filterOnTotem)
    .slice(0, MAX_ATTRIBUTES);
}

export function stockAttributes() {
  return load()
    .filter((item) => item && item.active && item.useOnStock)
    .slice(0, MAX_ATTRIBUTES);
}

export function productAttrValues(
  product: { attrs?: Record<string, string[]>; colors?: string[]; storages?: string[] },
  attr?: ProductAttribute,
) {
  if (!attr || !attr.id) return [];
  const mapped = product?.attrs?.[attr.id];
  if (Array.isArray(mapped) && mapped.length) return mapped;
  const name = String(attr.name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (name.includes('cor') && product?.colors?.length) return product.colors;
  if ((name.includes('capac') || name.includes('armazen')) && product?.storages?.length) {
    return product.storages;
  }
  if (name.includes('retir') || attr.id === ATTR_RET) {
    return product?.attrs?.[attr.id] ?? [];
  }
  return [];
}

/** Opções do picker no card: valores do produto, senão os valores cadastrados no atributo. */
export function resolveTotemAttrOptions(
  product: { attrs?: Record<string, string[]>; colors?: string[]; storages?: string[] },
  attr?: ProductAttribute,
) {
  if (!attr) return [];
  const fromProduct = productAttrValues(product, attr);
  if (fromProduct.length) return fromProduct;
  return Array.isArray(attr.values) ? attr.values.filter(Boolean) : [];
}

/** Atributos que aparecem no card (totem + filtro). */
export function totemCardAttributes() {
  const byId = new Map<string, ProductAttribute>();
  for (const item of load()) {
    if (!item || !item.active) continue;
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
