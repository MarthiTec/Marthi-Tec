import { nestDelete, nestGet, nestPatch, nestPost, nestPut } from './nestClient';

/** Grupos/subgrupos e movimentações do produto — tudo no banco da loja. */
export type ProductGroup = { id: string; name: string; parentId: string | null; active: boolean; productCount: number };
export type ProductGroupLabels = { group: string; subgroup: string };
export type ProductMovement = {
  id: string;
  direction: 'in' | 'out' | 'adjustment';
  type: string;
  origin: string;
  qty: number;
  unitCost: number;
  at: string;
  operator: string;
  notes: string;
  invoice: { id: string; number: string; series: string; issuedAt: string | null } | null;
  supplier: { id: string; name: string } | null;
  customer: { id: string | null; name: string } | null;
  saleId: string | null;
};

export const apiListProductGroups = () => nestGet<{ labels: ProductGroupLabels; groups: ProductGroup[] }>('/product-groups');
export const apiCreateProductGroup = (body: { name: string; parentId?: string | null; active?: boolean }) => nestPost<ProductGroup>('/product-groups', body);
export const apiUpdateProductGroup = (id: string, body: { name?: string; parentId?: string | null; active?: boolean }) =>
  nestPatch<ProductGroup>(`/product-groups/${encodeURIComponent(id)}`, body);
export const apiDeleteProductGroup = (id: string) => nestDelete<{ ok: true }>(`/product-groups/${encodeURIComponent(id)}`);
export const apiSaveProductGroupLabels = (labels: ProductGroupLabels) => nestPut<ProductGroupLabels>('/product-groups/labels', labels);

export const apiListProductMovements = (stockId: string, limit = 20) =>
  nestGet<ProductMovement[]>(`/stock/${encodeURIComponent(stockId)}/movements?limit=${limit}`);

/* Catálogo Marca → Tipo → Modelo (a descrição do produto sai daqui). */
export type CatalogType = { id: string; brandSlug: string; name: string; sort: number; own: boolean };
export type CatalogModel = { id: string; typeId: string; name: string; sort: number; own: boolean };
export const apiListCatalogTypes = (brandSlug?: string) => nestGet<CatalogType[]>(`/catalog/types${brandSlug ? `?brand=${encodeURIComponent(brandSlug)}` : ''}`);
export const apiCreateCatalogType = (body: { brandSlug: string; name: string }) => nestPost<CatalogType>('/catalog/types', body);
export const apiListCatalogModels = (typeId?: string) => nestGet<CatalogModel[]>(`/catalog/models${typeId ? `?typeId=${encodeURIComponent(typeId)}` : ''}`);
export const apiCreateCatalogModel = (body: { typeId: string; name: string }) => nestPost<CatalogModel>('/catalog/models', body);

/* Modo do estoque da loja. */
export type StockMode = 'simple' | 'standard';
export const apiGetStockMode = () => nestGet<{ mode: StockMode }>('/store/stock-mode');
export const apiSaveStockMode = (mode: StockMode) => nestPut<{ mode: StockMode }>('/store/stock-mode', { mode });

/* Entrada de estoque (tela de entrada). */
export type StockEntryRequest = {
  variation?: { id?: string; attrs: Record<string, string>; condition: 'new' | 'used' | 'refurbished'; price?: number };
  entry: { supplierId?: string | null; entryDate?: string; qty: number; unitCost: number; imeis: string[]; notes?: string; batteryLevel?: number | null; payment?: 'paid' | 'pending' | 'none'; dueDate?: string; accountId?: string | null };
};
export const apiCreateStockEntry = (stockId: string, body: StockEntryRequest) =>
  nestPost<{ product: import('../data/adminStore').StockItem; entryId: string; variationId: string | null; payableId: string | null }>(`/stock/${encodeURIComponent(stockId)}/entries`, body);
