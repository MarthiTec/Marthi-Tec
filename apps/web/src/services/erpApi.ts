import type {
  Customer,
  FinanceEntry,
  FinanceSource,
  PaymentMethod,
  PriceTable,
  SalesOrder,
  StockCondition,
  StockItem,
  StockKind,
} from '../data/adminStore';
import type { ProductAttribute } from '../data/attributeStore';
import type { OperatorProfile } from '../data/operatorProfile';
import type { StoreEntitlement } from '../data/storePlan';
import type { TotemSettings } from '../data/totemSettings';
import type {
  ChecklistMark,
  QuoteStatus,
  WorkOrder,
  WorkOrderPhotoKind,
  WorkOrderPriority,
  WorkOrderStatus,
} from '../data/osStore';
import {
  nestDelete,
  nestGet,
  nestPatch,
  nestPost,
  nestPut,
} from './nestClient';

export type SalesOrderDetail = SalesOrder & {
  customerId?: string | null;
  customerPhone?: string;
  discount?: number;
  surcharge?: number;
  paymentMethodId?: string | null;
  priceTableId?: string | null;
  lines?: Array<{
    id: string;
    stockId: string | null;
    name: string;
    qty: number;
    unitPrice: number;
    imei: string;
  }>;
};

/* ── Customers ─────────────────────────────────────────── */

export function apiListCustomers(q?: string) {
  const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
  return nestGet<Customer[]>(`/customers${qs}`);
}

export function apiCreateCustomer(body: Omit<Customer, 'id' | 'createdAt'>) {
  return nestPost<Customer>('/customers', body);
}

export function apiUpdateCustomer(id: string, body: Partial<Omit<Customer, 'id' | 'createdAt'>>) {
  return nestPatch<Customer>(`/customers/${id}`, body);
}

export function apiDeleteCustomer(id: string) {
  return nestDelete<Customer>(`/customers/${id}`);
}

/* ── Attributes ────────────────────────────────────────── */

export function apiListAttributes() {
  return nestGet<ProductAttribute[]>('/attributes');
}

export function apiCreateAttribute(body: Omit<ProductAttribute, 'id'>) {
  return nestPost<ProductAttribute>('/attributes', body);
}

export function apiUpdateAttribute(id: string, body: Partial<Omit<ProductAttribute, 'id'>>) {
  return nestPatch<ProductAttribute>(`/attributes/${id}`, body);
}

export function apiDeleteAttribute(id: string) {
  return nestDelete<{ ok: true }>(`/attributes/${id}`);
}

/* ── Stock ─────────────────────────────────────────────── */

export function apiListStock(query?: {
  kind?: StockKind;
  condition?: StockCondition;
  q?: string;
  low?: boolean;
}) {
  const params = new URLSearchParams();
  if (query?.kind) params.set('kind', query.kind);
  if (query?.condition) params.set('condition', query.condition);
  if (query?.q) params.set('q', query.q);
  if (query?.low) params.set('low', '1');
  const qs = params.toString();
  return nestGet<StockItem[]>(`/stock${qs ? `?${qs}` : ''}`);
}

export function apiLookupStock(code: string) {
  return nestGet<StockItem | null>(`/stock/lookup?code=${encodeURIComponent(code)}`);
}

export function apiCreateStock(body: Omit<StockItem, 'id'>) {
  return nestPost<StockItem>('/stock', body);
}

export function apiUpdateStock(id: string, body: Partial<Omit<StockItem, 'id'>>) {
  return nestPatch<StockItem>(`/stock/${id}`, body);
}

export function apiDeleteStock(id: string) {
  return nestDelete<{ ok: true }>(`/stock/${id}`);
}

/* ── Pricing ───────────────────────────────────────────── */

export function apiListPriceTables() {
  return nestGet<PriceTable[]>('/price-tables');
}

export function apiCreatePriceTable(body: Omit<PriceTable, 'id'>) {
  return nestPost<PriceTable>('/price-tables', body);
}

export function apiUpdatePriceTable(id: string, body: Partial<Omit<PriceTable, 'id'>>) {
  return nestPatch<PriceTable>(`/price-tables/${id}`, body);
}

export function apiDeletePriceTable(id: string) {
  return nestDelete<{ ok: true }>(`/price-tables/${id}`);
}

export function apiListPayments() {
  return nestGet<PaymentMethod[]>('/payments');
}

export function apiCreatePayment(body: Omit<PaymentMethod, 'id'>) {
  return nestPost<PaymentMethod>('/payments', body);
}

export function apiUpdatePayment(id: string, body: Partial<Omit<PaymentMethod, 'id'>>) {
  return nestPatch<PaymentMethod>(`/payments/${id}`, body);
}

export function apiDeletePayment(id: string) {
  return nestDelete<{ ok: true }>(`/payments/${id}`);
}

/* ── Finance ───────────────────────────────────────────── */

export function apiListFinance(query?: { source?: FinanceSource; from?: string; to?: string }) {
  const params = new URLSearchParams();
  if (query?.source) params.set('source', query.source);
  if (query?.from) params.set('from', query.from);
  if (query?.to) params.set('to', query.to);
  const qs = params.toString();
  return nestGet<FinanceEntry[]>(`/finance${qs ? `?${qs}` : ''}`);
}

export function apiCreateFinanceManual(body: { type: 'in' | 'out'; amount: number; label: string }) {
  return nestPost<FinanceEntry>('/finance', body);
}

/* ── Orders / POS ──────────────────────────────────────── */

export function apiListOrders() {
  return nestGet<SalesOrder[]>('/orders');
}

export function apiGetOrder(id: string) {
  return nestGet<SalesOrderDetail>(`/orders/${id}`);
}

export function apiClosePosSale(body: {
  ticketId: string | null;
  customerName: string;
  customerPhone: string;
  customerDocument?: string;
  paymentName: string;
  priceTableName: string;
  paymentMethodId?: string;
  priceTableId?: string;
  discount: number;
  surcharge: number;
  sellerId?: string;
  sellerName?: string;
  lines: Array<{
    stockId: string;
    name: string;
    qty: number;
    unitPrice: number;
    imei: string;
  }>;
}) {
  return nestPost<SalesOrderDetail>('/pos/sales', body);
}

/* ── Work orders ───────────────────────────────────────── */

export function apiListWorkOrders(query?: {
  status?: WorkOrderStatus;
  technician?: string;
  q?: string;
}) {
  const params = new URLSearchParams();
  if (query?.status) params.set('status', query.status);
  if (query?.technician) params.set('technician', query.technician);
  if (query?.q) params.set('q', query.q);
  const qs = params.toString();
  return nestGet<WorkOrder[]>(`/work-orders${qs ? `?${qs}` : ''}`);
}

export function apiGetWorkOrder(id: string) {
  return nestGet<WorkOrder>(`/work-orders/${id}`);
}

export function apiCreateWorkOrder(body: Record<string, unknown>) {
  return nestPost<WorkOrder>('/work-orders', body);
}

export function apiUpdateWorkOrder(id: string, body: Record<string, unknown>) {
  return nestPatch<WorkOrder>(`/work-orders/${id}`, body);
}

export function apiConsumePart(
  id: string,
  body: { stockId: string; qty: number; unitPrice?: number },
) {
  return nestPost<WorkOrder>(`/work-orders/${id}/parts`, body);
}

export function apiRemovePart(id: string, lineId: string) {
  return nestDelete<WorkOrder>(`/work-orders/${id}/parts/${lineId}`);
}

export function apiPurchaseAsset(
  id: string,
  body: {
    cost: number;
    price?: number;
    sku?: string;
    imei?: string;
    name?: string;
    kind?: StockKind;
  },
) {
  return nestPost<WorkOrder & { stock?: StockItem }>(`/work-orders/${id}/purchase`, body);
}

export function apiDeliverWorkOrder(id: string) {
  return nestPost<WorkOrder>(`/work-orders/${id}/deliver`);
}

export function apiCancelWorkOrder(id: string) {
  return nestPost<WorkOrder>(`/work-orders/${id}/cancel`);
}

export function apiAddPhoto(
  id: string,
  body: { kind: WorkOrderPhotoKind; dataUrl: string; caption?: string },
) {
  return nestPost<WorkOrder>(`/work-orders/${id}/photos`, body);
}

export function apiRemovePhoto(id: string, photoId: string) {
  return nestDelete<WorkOrder>(`/work-orders/${id}/photos/${photoId}`);
}

export function apiPatchChecklist(
  id: string,
  itemId: string,
  body: { mark?: ChecklistMark; note?: string },
) {
  return nestPatch<WorkOrder>(`/work-orders/${id}/checklist/${itemId}`, body);
}

export function apiSignWorkOrder(id: string, body: { dataUrl: string; signedName?: string }) {
  return nestPost<WorkOrder>(`/work-orders/${id}/signature`, body);
}

export function apiClearSignature(id: string) {
  return nestDelete<WorkOrder>(`/work-orders/${id}/signature`);
}

export function apiQuoteDraft(
  id: string,
  body: { notes?: string; validUntil?: string; labor?: number },
) {
  return nestPost<WorkOrder>(`/work-orders/${id}/quote/draft`, body);
}

export function apiQuoteSend(id: string) {
  return nestPost<WorkOrder>(`/work-orders/${id}/quote/send`);
}

export function apiQuoteApprove(id: string, body?: { moveToProgress?: boolean }) {
  return nestPost<WorkOrder>(`/work-orders/${id}/quote/approve`, body ?? {});
}

export function apiQuoteReject(id: string) {
  return nestPost<WorkOrder>(`/work-orders/${id}/quote/reject`);
}

export function apiQuoteReopen(id: string) {
  return nestPost<WorkOrder>(`/work-orders/${id}/quote/reopen`);
}

export type { QuoteStatus, WorkOrderPriority };

/* ── Store / me ────────────────────────────────────────── */

export function apiGetStorePlan() {
  return nestGet<StoreEntitlement>('/store/plan');
}

export function apiPutStorePlan(body: StoreEntitlement) {
  return nestPut<StoreEntitlement>('/store/plan', body);
}

export function apiGetTotemSettings() {
  return nestGet<TotemSettings>('/store/totem-settings');
}

export function apiPutTotemSettings(body: Partial<TotemSettings>) {
  return nestPut<TotemSettings>('/store/totem-settings', body);
}

export function apiGetOperatorProfile() {
  return nestGet<OperatorProfile>('/me/profile');
}

export function apiPutOperatorProfile(body: Partial<OperatorProfile>) {
  return nestPut<OperatorProfile>('/me/profile', body);
}

/* ── Fase 3 P0: Registry ───────────────────────────────── */

export type AccessArea =
  | 'totem'
  | 'pdv'
  | 'os'
  | 'erp_customers'
  | 'erp_stock'
  | 'erp_attrs'
  | 'erp_prices'
  | 'erp_payments'
  | 'erp_finance'
  | 'erp_sellers'
  | 'erp_suppliers'
  | 'erp_employees'
  | 'erp_audit'
  | 'erp_invoices'
  | 'erp_fiscal'
  | 'ecommerce'
  | 'erp_plan';

export type ApiSeller = {
  id: string;
  name: string;
  phone: string;
  email: string;
  document: string;
  commissionPercent: number;
  active: boolean;
  employeeId?: string;
  createdAt: string;
  updatedAt: string;
};

export type ApiSupplier = {
  id: string;
  name: string;
  tradeName: string;
  document: string;
  phone: string;
  email: string;
  city: string;
  notes: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ApiEmployee = {
  id: string;
  name: string;
  phone: string;
  email: string;
  document: string;
  role: 'admin' | 'manager' | 'operator' | 'seller';
  isSystemUser: boolean;
  userEmail: string;
  accessAreas: AccessArea[];
  active: boolean;
  sellerId?: string;
  createdAt: string;
  updatedAt: string;
};

export type ApiMeAccess = {
  role: ApiEmployee['role'];
  accessAreas: AccessArea[];
  employeeId?: string;
  sellerId?: string;
};

export type ApiPosTicket = {
  id: string;
  source: 'totem' | 'manual';
  status: 'open' | 'sold' | 'cancelled';
  customerName: string;
  customerPhone: string;
  productName: string;
  attributes?: Array<{ id: string; name: string; value: string }>;
  color: string;
  storage: string;
  fulfillment: string;
  payment: string;
  installment: string | null;
  priceLabel: string;
  createdAt: string;
  closedAt: string | null;
};

export function apiListSellers(activeOnly?: boolean) {
  const qs = activeOnly ? '?active=true' : '';
  return nestGet<ApiSeller[]>(`/sellers${qs}`);
}

export function apiCreateSeller(body: Omit<ApiSeller, 'id' | 'createdAt' | 'updatedAt'>) {
  return nestPost<ApiSeller>('/sellers', body);
}

export function apiUpdateSeller(id: string, body: Partial<Omit<ApiSeller, 'id' | 'createdAt' | 'updatedAt'>>) {
  return nestPatch<ApiSeller>(`/sellers/${id}`, body);
}

export function apiDeleteSeller(id: string) {
  return nestDelete<ApiSeller>(`/sellers/${id}`);
}

export function apiListSuppliers(activeOnly?: boolean) {
  const qs = activeOnly ? '?active=true' : '';
  return nestGet<ApiSupplier[]>(`/suppliers${qs}`);
}

export function apiCreateSupplier(body: Omit<ApiSupplier, 'id' | 'createdAt' | 'updatedAt'>) {
  return nestPost<ApiSupplier>('/suppliers', body);
}

export function apiUpdateSupplier(
  id: string,
  body: Partial<Omit<ApiSupplier, 'id' | 'createdAt' | 'updatedAt'>>,
) {
  return nestPatch<ApiSupplier>(`/suppliers/${id}`, body);
}

export function apiDeleteSupplier(id: string) {
  return nestDelete<ApiSupplier>(`/suppliers/${id}`);
}

export function apiListEmployees(activeOnly?: boolean) {
  const qs = activeOnly ? '?active=true' : '';
  return nestGet<ApiEmployee[]>(`/employees${qs}`);
}

export function apiCreateEmployee(body: Omit<ApiEmployee, 'id' | 'createdAt' | 'updatedAt'>) {
  return nestPost<ApiEmployee>('/employees', body);
}

export function apiUpdateEmployee(
  id: string,
  body: Partial<Omit<ApiEmployee, 'id' | 'createdAt' | 'updatedAt'>>,
) {
  return nestPatch<ApiEmployee>(`/employees/${id}`, body);
}

export function apiDeleteEmployee(id: string) {
  return nestDelete<ApiEmployee>(`/employees/${id}`);
}

export function apiGetMeAccess() {
  return nestGet<ApiMeAccess>('/me/access');
}

/* ── Fase 3 P0: Totem leads + POS tickets ──────────────── */

export function apiSubmitTotemLead(body: {
  customerName: string;
  customerPhone: string;
  productName: string;
  attributes?: Array<{ id: string; name: string; value: string }>;
  color: string;
  storage: string;
  fulfillment: string;
  payment: string;
  installment: string | null;
  priceLabel: string;
}) {
  return nestPost<{ id: string; customerNotified?: boolean }>('/totem/leads', body);
}

export function apiListPosTickets(status?: ApiPosTicket['status']) {
  const qs = status ? `?status=${status}` : '';
  return nestGet<{ items: ApiPosTicket[] }>(`/pos/tickets${qs}`);
}

export function apiCreatePosTicket(body: {
  customerName: string;
  customerPhone: string;
  productName: string;
  attributes?: Array<{ id: string; name: string; value: string }>;
  color?: string;
  storage?: string;
  fulfillment?: string;
  payment: string;
  installment?: string | null;
  priceLabel?: string;
}) {
  return nestPost<ApiPosTicket>('/pos/tickets', body);
}

export function apiPatchPosTicket(id: string, status: ApiPosTicket['status']) {
  return nestPatch<ApiPosTicket>(`/pos/tickets/${id}`, { status });
}
