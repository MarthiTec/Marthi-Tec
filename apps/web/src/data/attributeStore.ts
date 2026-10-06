import { getActiveTenantKey, tenantScopedKey } from './tenantContext';
import { isNestAuthed, getAuthToken } from '../services/nestClient';
import { getExplicitTotemStoreId } from './totemContext';
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
  useOnPdv?: boolean;
  useOnExternalSale?: boolean;
  sort: number;
  active: boolean;
};

export type PickedAttribute = {
  id: string;
  name: string;
  value: string;
};

export const ATTRIBUTES_EVENT = 'marthi-attributes-updated';
let memoryAttrs: ProductAttribute[] = [];
let memoryContext = '';
function context() {
  const store = localStorage.getItem(tenantScopedKey('marthi.multi_store.active_store_id.v1')) || '';
  return [getActiveTenantKey(),getAuthToken(),store,window.location.search].join('|');
}
function load() {
  if (memoryContext !== context()) { memoryAttrs=[]; memoryContext=context(); }
  return [...memoryAttrs].sort((a,b)=>a.sort-b.sort || a.name.localeCompare(b.name,'pt-BR'));
}
function persist(items: ProductAttribute[], expected = context()) {
  if(expected !== context()) return load();
  memoryContext=expected; memoryAttrs=items;
  window.dispatchEvent(new Event(ATTRIBUTES_EVENT));
  return load();
}
export function seedAttributes(): ProductAttribute[] { return []; }
export function clearAttributes(): ProductAttribute[] { return persist([]); }
export function replaceAttributes(items: ProductAttribute[]) { return persist(items); }
export function getAttributes() { return load(); }
export async function hydrateAttributesFromApi(): Promise<ProductAttribute[]> {
 const expected=context();
 const { apiGetTotemPublicAttributes,apiListAttributes }=await import('../services/erpApi');
 try { return persist(await (isNestAuthed() && !getExplicitTotemStoreId() ? apiListAttributes() : apiGetTotemPublicAttributes()),expected); }
 catch(error) {
   const status=(error as {status?:number}).status;
   if(status===401 || status===403 || status===404) persist([],expected);
   throw error;
 }
}
function authenticated() { if(!isNestAuthed()) throw new Error('Entre na sua conta para salvar atributos.'); }
export async function createAttribute(payload: Omit<ProductAttribute,'id'>) {
 authenticated(); const expected=context(); const current=load();
 const { apiCreateAttribute }=await import('../services/erpApi');
 const created=await apiCreateAttribute(payload);
 return persist([...current,created],expected);
}
export async function updateAttribute(id: string,payload: Partial<Omit<ProductAttribute,'id'>>) {
 authenticated(); const expected=context(); const current=load();
 const { apiUpdateAttribute }=await import('../services/erpApi');
 const updated=await apiUpdateAttribute(id,payload);
 return persist(current.map(item=>item.id===id ? updated : item),expected);
}
export async function removeAttribute(id: string) {
 authenticated(); const expected=context(); const current=load();
 const { apiDeleteAttribute }=await import('../services/erpApi');
 await apiDeleteAttribute(id); return persist(current.filter(item=>item.id!==id),expected);
}
export async function saveAttributes(items: ProductAttribute[]) {
 authenticated(); const expected=context();
 const { apiCreateAttribute,apiUpdateAttribute,apiListAttributes }=await import('../services/erpApi');
 const current=await apiListAttributes();
 for(const item of items) {
  if(expected!==context()) throw new Error('A loja selecionada mudou.');
  if(current.some(row=>row.id===item.id)) await apiUpdateAttribute(item.id,item);
  else await apiCreateAttribute(item);
 }
 return persist(await apiListAttributes(),expected);
}
export function posAttributes() { return load().filter(a=>a.active && a.useOnPdv!==false); }
export function externalSaleAttributes() { return load().filter(a=>a.active && a.useOnExternalSale!==false); }
function sortAttrs(items: ProductAttribute[]) { return [...items].sort((a,b)=>a.sort-b.sort); }

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

/** Somente opções vinculadas ao produto podem ser oferecidas ao comprador. */
export function resolveTotemAttrOptions(
  product: { attrs?: Record<string, string[]>; colors?: string[]; storages?: string[] },
  attr?: ProductAttribute,
) {
  if (!attr) return [];
  const fromProduct = productAttrValues(product, attr);
  return fromProduct.filter(Boolean);
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
