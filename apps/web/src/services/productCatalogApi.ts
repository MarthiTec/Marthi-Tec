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
