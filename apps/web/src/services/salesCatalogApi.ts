import { nestDelete, nestGet, nestPatch, nestPost } from './nestClient';
import type { CatalogItem, CatalogLook, CatalogStore } from '../components/CatalogDocument';

/** Catálogo de produtos para o cliente (salvo no banco da loja; o cliente abre pelo link). */
export type SalesCatalog = CatalogLook & {
  id: string;
  hideSoldOut: boolean;
  /** Produtos sob encomenda entram sempre (mesmo sem marcar). */
  includeOrderProducts: boolean;
  productIds: string[];
  /** Faixa "Destaques" no topo da página de venda. */
  featuredIds: string[];
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
export const apiPreviewSalesCatalog = (productIds: string[], hideSoldOut: boolean, includeOrderProducts: boolean) =>
  nestPost<CatalogPage>('/sales-catalogs/preview', { productIds, hideSoldOut, includeOrderProducts });
export type CatalogSeller = { id: string; name: string };
export const apiPublicSalesCatalog = (token: string) =>
  nestGet<CatalogPage & { catalog: CatalogLook & { hideSoldOut: boolean }; sellers: CatalogSeller[] }>(`/public/sales-catalogs/${encodeURIComponent(token)}`);

/** Pedido (ou só cadastro) que o cliente envia pelo catálogo. */
export type CatalogCustomerInput = {
  name: string;
  documentType: 'cpf' | 'cnpj';
  document: string;
  rg: string;
  phone: string;
  email: string;
  zipCode: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
};
export type CatalogTradeInInput = {
  device: string;
  capacity: string;
  color: string;
  imei: string;
  battery: number | null;
  condition: 'perfect' | 'marks' | 'damaged';
  screenReplaced: boolean;
  opened: boolean;
  faceIdOk: boolean;
  hasBox: boolean;
  hasInvoice: boolean;
  notes: string;
};
export type CatalogOrderInput = {
  kind: 'order' | 'signup';
  requestKey: string;
  customer: CatalogCustomerInput;
  sellerId: string | null;
  items: Array<{ productId: string; attributes: Array<{ id: string; value: string }>; qty: number }>;
  payment: string;
  installments: number;
  fulfillment: 'store' | 'delivery';
  tradeIn: CatalogTradeInInput | null;
  notes: string;
  website: string;
};
export const apiSubmitCatalogOrder = (token: string, body: CatalogOrderInput) =>
  nestPost<{ id: string; code: string; total: number }>(`/public/sales-catalogs/${encodeURIComponent(token)}/orders`, body);

/** Fila da loja (venda externa). */
export type CatalogOrderLine = { productId: string; name: string; variantLabel: string; condition: string; attributes: Array<{ id: string; name: string; value: string }>; qty: number; price: number; availability: 'in_stock' | 'order'; leadDays: number | null; pickupMethodId: string | null };
export type CatalogOrder = {
  id: string;
  code: string;
  kind: 'order' | 'signup';
  status: 'new' | 'in_service' | 'sold' | 'cancelled';
  customer: CatalogCustomerInput;
  customerId: string | null;
  sellerId: string | null;
  sellerName: string;
  items: CatalogOrderLine[];
  tradeIn: CatalogTradeInInput | null;
  payment: string;
  installments: number;
  fulfillment: 'store' | 'delivery';
  notes: string;
  total: number;
  catalogTitle: string;
  createdAt: string;
};
export const apiListCatalogOrders = () => nestGet<CatalogOrder[]>('/catalog-orders');
export const apiAcceptCatalogOrder = (id: string) =>
  nestPost<{ order: CatalogOrder; createdCustomer: boolean; customer: { id: string; name: string; phone: string; document: string; email: string } }>(`/catalog-orders/${encodeURIComponent(id)}/accept`, {});
export const apiCancelCatalogOrder = (id: string, reason: string) => nestPost<CatalogOrder>(`/catalog-orders/${encodeURIComponent(id)}/cancel`, { reason });

/** Endereço que o cliente abre (mesmo domínio do painel). */
export const catalogPublicUrl = (token: string) => `${window.location.origin}/catalogo/${token}`;
