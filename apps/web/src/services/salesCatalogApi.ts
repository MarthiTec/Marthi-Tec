import { nestDelete, nestGet, nestPatch, nestPost } from './nestClient';
import type { CatalogItem, CatalogLook, CatalogStore } from '../components/CatalogDocument';

/** Catálogo de produtos para o cliente (salvo no banco da loja; o cliente abre pelo link). */
export type SalesCatalog = CatalogLook & {
  id: string;
  hideSoldOut: boolean;
  productIds: string[];
  token: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};
export type SalesCatalogInput = Omit<SalesCatalog, 'id' | 'token' | 'createdBy' | 'createdAt' | 'updatedAt'>;
export type CatalogPage = { store: CatalogStore; items: CatalogItem[] };

export const apiListSalesCatalogs = () => nestGet<SalesCatalog[]>('/sales-catalogs');
export const apiCreateSalesCatalog = (body: SalesCatalogInput) => nestPost<SalesCatalog>('/sales-catalogs', body);
export const apiUpdateSalesCatalog = (id: string, body: SalesCatalogInput) => nestPatch<SalesCatalog>(`/sales-catalogs/${encodeURIComponent(id)}`, body);
export const apiDeleteSalesCatalog = (id: string) => nestDelete<{ ok: true }>(`/sales-catalogs/${encodeURIComponent(id)}`);
export const apiNewSalesCatalogLink = (id: string) => nestPost<SalesCatalog>(`/sales-catalogs/${encodeURIComponent(id)}/new-link`, {});
export const apiPreviewSalesCatalog = (productIds: string[], hideSoldOut: boolean) => nestPost<CatalogPage>('/sales-catalogs/preview', { productIds, hideSoldOut });
export const apiPublicSalesCatalog = (token: string) =>
  nestGet<CatalogPage & { catalog: CatalogLook & { hideSoldOut: boolean } }>(`/public/sales-catalogs/${encodeURIComponent(token)}`);

/** Endereço que o cliente abre (mesmo domínio do painel). */
export const catalogPublicUrl = (token: string) => `${window.location.origin}/catalogo/${token}`;
