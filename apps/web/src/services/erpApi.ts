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

export function apiCreateStock(body: Record<string, unknown>) {
  return nestPost<StockItem>('/stock', body);
}

export function apiUpdateStock(id: string, body: Record<string, unknown>) {
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

/* ── Fase 3 P1: Finance book ───────────────────────────── */

export type ApiBankAccount = {
  id: string;
  name: string;
  bank: string;
  agency: string;
  number: string;
  type: 'checking' | 'savings' | 'cash' | 'digital';
  initialBalance: number;
  balance?: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ApiPayable = {
  id: string;
  description: string;
  supplierId: string;
  supplierName: string;
  category: string;
  amount: number;
  paidAmount: number;
  dueDate: string;
  status: 'open' | 'partial' | 'paid' | 'cancelled';
  accountId: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
};

export type ApiReceivable = {
  id: string;
  description: string;
  customerName: string;
  category: string;
  amount: number;
  receivedAmount: number;
  dueDate: string;
  status: 'open' | 'partial' | 'paid' | 'cancelled';
  accountId: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  receivedAt?: string;
};

export type ApiTreasuryMove = {
  id: string;
  kind: 'transfer' | 'deposit' | 'withdraw' | 'adjustment';
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  description: string;
  at: string;
};

export type ApiAdvancePayment = {
  id: string;
  kind: 'customer' | 'supplier';
  partyName: string;
  amount: number;
  usedAmount: number;
  accountId: string;
  notes: string;
  status: 'open' | 'applied' | 'refunded';
  createdAt: string;
  updatedAt: string;
};

export function apiListBankAccounts(activeOnly?: boolean) {
  const qs = activeOnly ? '?active=true' : '';
  return nestGet<ApiBankAccount[]>(`/bank-accounts${qs}`);
}

export function apiCreateBankAccount(
  body: Omit<ApiBankAccount, 'id' | 'createdAt' | 'updatedAt' | 'balance'>,
) {
  return nestPost<ApiBankAccount>('/bank-accounts', body);
}

export function apiUpdateBankAccount(
  id: string,
  body: Partial<Omit<ApiBankAccount, 'id' | 'createdAt' | 'updatedAt' | 'balance'>>,
) {
  return nestPatch<ApiBankAccount>(`/bank-accounts/${id}`, body);
}

export function apiDeleteBankAccount(id: string) {
  return nestDelete<ApiBankAccount>(`/bank-accounts/${id}`);
}

export function apiListPayables(query?: { status?: ApiPayable['status']; from?: string; to?: string }) {
  const params = new URLSearchParams();
  if (query?.status) params.set('status', query.status);
  if (query?.from) params.set('from', query.from);
  if (query?.to) params.set('to', query.to);
  const qs = params.toString();
  return nestGet<ApiPayable[]>(`/payables${qs ? `?${qs}` : ''}`);
}

export function apiCreatePayable(
  body: Omit<ApiPayable, 'id' | 'paidAmount' | 'status' | 'createdAt' | 'updatedAt' | 'paidAt'>,
) {
  return nestPost<ApiPayable>('/payables', body);
}

export function apiUpdatePayable(
  id: string,
  body: Partial<
    Omit<ApiPayable, 'id' | 'paidAmount' | 'createdAt' | 'updatedAt' | 'paidAt'> & {
      status: ApiPayable['status'];
    }
  >,
) {
  return nestPatch<ApiPayable>(`/payables/${id}`, body);
}

export function apiPayPayable(
  id: string,
  body: { amount: number; accountId?: string; at?: string },
) {
  return nestPost<ApiPayable>(`/payables/${id}/pay`, body);
}

export function apiListReceivables(query?: {
  status?: ApiReceivable['status'];
  from?: string;
  to?: string;
}) {
  const params = new URLSearchParams();
  if (query?.status) params.set('status', query.status);
  if (query?.from) params.set('from', query.from);
  if (query?.to) params.set('to', query.to);
  const qs = params.toString();
  return nestGet<ApiReceivable[]>(`/receivables${qs ? `?${qs}` : ''}`);
}

export function apiCreateReceivable(
  body: Omit<
    ApiReceivable,
    'id' | 'receivedAmount' | 'status' | 'createdAt' | 'updatedAt' | 'receivedAt'
  >,
) {
  return nestPost<ApiReceivable>('/receivables', body);
}

export function apiUpdateReceivable(
  id: string,
  body: Partial<
    Omit<ApiReceivable, 'id' | 'receivedAmount' | 'createdAt' | 'updatedAt' | 'receivedAt'> & {
      status: ApiReceivable['status'];
    }
  >,
) {
  return nestPatch<ApiReceivable>(`/receivables/${id}`, body);
}

export function apiReceiveReceivable(
  id: string,
  body: { amount: number; accountId?: string; at?: string },
) {
  return nestPost<ApiReceivable>(`/receivables/${id}/receive`, body);
}

export function apiListTreasury() {
  return nestGet<ApiTreasuryMove[]>('/treasury');
}

export function apiCreateTreasury(body: {
  kind: ApiTreasuryMove['kind'];
  fromAccountId?: string;
  toAccountId?: string;
  amount: number;
  description?: string;
  at?: string;
}) {
  return nestPost<ApiTreasuryMove>('/treasury', body);
}

export function apiListAdvances() {
  return nestGet<ApiAdvancePayment[]>('/advances');
}

export function apiCreateAdvance(body: {
  kind: ApiAdvancePayment['kind'];
  partyName: string;
  amount: number;
  accountId: string;
  notes?: string;
}) {
  return nestPost<ApiAdvancePayment>('/advances', body);
}

export function apiApplyAdvance(id: string, body: { amount: number }) {
  return nestPost<ApiAdvancePayment>(`/advances/${id}/apply`, body);
}

export function apiRefundAdvance(id: string) {
  return nestPost<ApiAdvancePayment>(`/advances/${id}/refund`);
}

/* ── Fase 3 P1: Warehouses / lots / kits / moves ───────── */

export type ApiWarehouse = {
  id: string;
  name: string;
  code: string;
  address: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type ApiProductLot = {
  id: string;
  stockId: string;
  stockName: string;
  lotNumber: string;
  manufacturingDate: string;
  expiryDate: string;
  qty: number;
  supplierId: string;
  supplierName: string;
  warehouseId: string;
  notes: string;
  createdAt: string;
};

export type ApiProductKit = {
  id: string;
  name: string;
  sku: string;
  parentStockId: string;
  items: Array<{ stockId: string; stockName: string; qty: number }>;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ApiWarehouseMove = {
  id: string;
  kind: 'in' | 'out' | 'transfer' | 'adjust';
  stockId: string;
  stockName: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  lotId: string;
  qty: number;
  note?: string;
  description?: string;
  at?: string;
  createdAt?: string;
};

export function apiListWarehouses(activeOnly?: boolean) {
  const qs = activeOnly ? '?active=true' : '';
  return nestGet<ApiWarehouse[]>(`/warehouses${qs}`);
}

export function apiCreateWarehouse(body: Omit<ApiWarehouse, 'id' | 'createdAt' | 'updatedAt'>) {
  return nestPost<ApiWarehouse>('/warehouses', body);
}

export function apiUpdateWarehouse(
  id: string,
  body: Partial<Omit<ApiWarehouse, 'id' | 'createdAt' | 'updatedAt'>>,
) {
  return nestPatch<ApiWarehouse>(`/warehouses/${id}`, body);
}

export function apiDeleteWarehouse(id: string) {
  return nestDelete<ApiWarehouse>(`/warehouses/${id}`);
}

export function apiListLots(stockId?: string) {
  const qs = stockId ? `?stockId=${encodeURIComponent(stockId)}` : '';
  return nestGet<ApiProductLot[]>(`/lots${qs}`);
}

export function apiCreateLot(body: {
  stockId: string;
  stockName?: string;
  lotNumber: string;
  manufacturingDate?: string;
  expiryDate?: string;
  qty: number;
  supplierId?: string;
  supplierName?: string;
  warehouseId: string;
  notes?: string;
}) {
  return nestPost<ApiProductLot>('/lots', body);
}

export function apiUpdateLot(id: string, body: { qty: number }) {
  return nestPatch<ApiProductLot>(`/lots/${id}`, body);
}

export function apiListKits(activeOnly?: boolean) {
  const qs = activeOnly ? '?active=true' : '';
  return nestGet<ApiProductKit[]>(`/kits${qs}`);
}

export function apiCreateKit(body: {
  name: string;
  sku?: string;
  parentStockId?: string;
  items: Array<{ stockId: string; stockName?: string; qty: number }>;
  active?: boolean;
}) {
  return nestPost<ApiProductKit>('/kits', body);
}

export function apiUpdateKit(
  id: string,
  body: {
    name?: string;
    sku?: string;
    parentStockId?: string;
    items?: Array<{ stockId: string; stockName?: string; qty: number }>;
    active?: boolean;
  },
) {
  return nestPatch<ApiProductKit>(`/kits/${id}`, body);
}

export function apiDeleteKit(id: string) {
  return nestDelete<ApiProductKit>(`/kits/${id}`);
}

export function apiListWarehouseMoves() {
  return nestGet<ApiWarehouseMove[]>('/warehouse-moves');
}

export function apiCreateWarehouseMove(body: {
  kind: ApiWarehouseMove['kind'];
  stockId: string;
  fromWarehouseId?: string;
  toWarehouseId?: string;
  lotId?: string;
  qty: number;
  note?: string;
  description?: string;
  operatorName?: string;
}) {
  return nestPost<ApiWarehouseMove>('/warehouse-moves', body);
}

/* ── Fase 3 P1: Stock invoices ─────────────────────────── */

export type ApiInvoiceLine = {
  id: string;
  stockId: string;
  name: string;
  qty: number;
  unitCost: number;
  unitPrice: number;
};

export type ApiInvoice = {
  id: string;
  kind: 'entry' | 'exit';
  number: string;
  status: 'draft' | 'posted' | 'cancelled';
  documentPurpose: string;
  supplierId: string;
  customerName: string;
  issuedAt: string;
  notes: string;
  lines: ApiInvoiceLine[];
  createdAt: string;
  updatedAt: string;
  postedAt?: string;
};

export function apiListStockInvoices(query?: {
  kind?: ApiInvoice['kind'];
  status?: ApiInvoice['status'];
}) {
  const params = new URLSearchParams();
  if (query?.kind) params.set('kind', query.kind);
  if (query?.status) params.set('status', query.status);
  const qs = params.toString();
  return nestGet<ApiInvoice[]>(`/stock-invoices${qs ? `?${qs}` : ''}`);
}

export function apiGetStockInvoice(id: string) {
  return nestGet<ApiInvoice>(`/stock-invoices/${id}`);
}

export function apiCreateStockInvoice(body: {
  kind: ApiInvoice['kind'];
  number?: string;
  documentPurpose?: string;
  supplierId?: string;
  customerName?: string;
  issuedAt?: string;
  notes?: string;
}) {
  return nestPost<ApiInvoice>('/stock-invoices', body);
}

export function apiUpdateStockInvoice(
  id: string,
  body: Partial<{
    number: string;
    documentPurpose: string;
    supplierId: string;
    customerName: string;
    issuedAt: string;
    notes: string;
  }>,
) {
  return nestPatch<ApiInvoice>(`/stock-invoices/${id}`, body);
}

export function apiAddStockInvoiceLine(
  id: string,
  body: { stockId: string; qty: number; unitCost?: number; unitPrice?: number },
) {
  return nestPost<ApiInvoice>(`/stock-invoices/${id}/lines`, body);
}

export function apiRemoveStockInvoiceLine(id: string, lineId: string) {
  return nestDelete<ApiInvoice>(`/stock-invoices/${id}/lines/${lineId}`);
}

export function apiPostStockInvoice(id: string) {
  return nestPost<ApiInvoice>(`/stock-invoices/${id}/post`);
}

export function apiCancelStockInvoice(id: string) {
  return nestPost<ApiInvoice>(`/stock-invoices/${id}/cancel`);
}

/* ── Fase 3 P2: Cash register ──────────────────────────── */

export type ApiCashMovement = {
  id: string;
  kind: string;
  amount: number;
  note: string;
  reason?: string;
  beneficiaryType?: 'store' | 'employee';
  beneficiaryId?: string;
  beneficiaryName?: string;
  createdAt: string;
  operatorName: string;
};

export type ApiCashSession = {
  id: string;
  openedAt: string;
  closedAt?: string;
  openingFloat: number;
  expectedCash: number;
  countedCash?: number;
  difference?: number;
  operatorName: string;
  status: 'open' | 'closed';
  reopenCount: number;
  movements: ApiCashMovement[];
};

export type ApiStoreCredit = {
  id: string;
  code: string;
  customerName: string;
  customerPhone: string;
  amount: number;
  remaining: number;
  note: string;
  createdAt: string;
  operatorName: string;
  status: 'open' | 'used' | 'cancelled';
  orderId?: string;
};

export type ApiExchangeLine = {
  stockId: string;
  name: string;
  sku?: string;
  qty: number;
  unitPrice: number;
};

export type ApiExchangeRecord = {
  id: string;
  orderId: string;
  customerName: string;
  customerPhone: string;
  returnLines: ApiExchangeLine[];
  outLines: ApiExchangeLine[];
  returnTotal: number;
  outTotal: number;
  cashDelta: number;
  creditId?: string;
  note: string;
  createdAt: string;
  operatorName: string;
};

export function apiListCashSessions() {
  return nestGet<ApiCashSession[]>('/cash/sessions');
}

export function apiGetOpenCashSession() {
  return nestGet<ApiCashSession | null>('/cash/sessions/open');
}

export function apiGetCashSession(id: string) {
  return nestGet<ApiCashSession>(`/cash/sessions/${id}`);
}

export function apiOpenCashSession(body: {
  openingFloat: number;
  operatorName: string;
  note?: string;
  openedAt?: string;
}) {
  return nestPost<ApiCashSession>('/cash/sessions/open', body);
}

export function apiCashAporte(
  id: string,
  body: {
    amount: number;
    note?: string;
    reason?: string;
    beneficiaryType?: 'store' | 'employee';
    beneficiaryId?: string;
    beneficiaryName?: string;
    operatorName?: string;
    at?: string;
  },
) {
  return nestPost<ApiCashSession>(`/cash/sessions/${id}/aporte`, body);
}

export function apiCashSangria(
  id: string,
  body: {
    amount: number;
    note?: string;
    reason?: string;
    beneficiaryType?: 'store' | 'employee';
    beneficiaryId?: string;
    beneficiaryName?: string;
    operatorName?: string;
    at?: string;
  },
) {
  return nestPost<ApiCashSession>(`/cash/sessions/${id}/sangria`, body);
}

export function apiCashDrawer(id: string, body?: { note?: string; operatorName?: string }) {
  return nestPost<ApiCashSession>(`/cash/sessions/${id}/drawer`, body ?? {});
}

export function apiCloseCashSession(
  id: string,
  body: { countedCash: number; operatorName: string; note?: string },
) {
  return nestPost<ApiCashSession>(`/cash/sessions/${id}/close`, body);
}

export function apiReopenCashSession(id: string, body: { operatorName: string; note?: string }) {
  return nestPost<ApiCashSession>(`/cash/sessions/${id}/reopen`, body);
}

export function apiListStoreCredits() {
  return nestGet<ApiStoreCredit[]>('/cash/credits');
}

export function apiCreateStoreCredit(body: {
  customerName: string;
  customerPhone?: string;
  amount: number;
  note?: string;
  operatorName?: string;
  orderId?: string;
  affectCash?: boolean;
}) {
  return nestPost<ApiStoreCredit>('/cash/credits', body);
}

export function apiUseStoreCredit(
  id: string,
  body: { amount: number; operatorName?: string },
) {
  return nestPost<ApiStoreCredit>(`/cash/credits/${id}/use`, body);
}

export function apiListCashExchanges() {
  return nestGet<ApiExchangeRecord[]>('/cash/exchanges');
}

export function apiCreateCashExchange(body: {
  orderId: string;
  customerName: string;
  customerPhone?: string;
  returnLines: ApiExchangeLine[];
  outLines: ApiExchangeLine[];
  note?: string;
  operatorName?: string;
  settleAs?: 'cash' | 'credit';
}) {
  return nestPost<ApiExchangeRecord>('/cash/exchanges', body);
}

/* ── Fase 3 P2: Fiscal catalog (classifications / CFOP / FECP) ── */

export type ApiFiscalClassification = {
  id: string;
  name: string;
  ncm: string;
  cstIcms: string;
  cClasTrib: string;
  icmsRate: number;
  ipiCst: string;
  ipiRate: number;
  pisCst: string;
  pisRate: number;
  cofinsCst: string;
  cofinsRate: number;
  ibsRate: number;
  cbsRate: number;
  defaultCfopId: string;
  notes: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ApiCfopCode = {
  id: string;
  code: string;
  description: string;
  operation: 'in_same' | 'in_other' | 'out_same' | 'out_other' | 'other';
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type ApiFecpRule = {
  id: string;
  uf: string;
  description: string;
  rate: number;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export function apiListFiscalClassifications(activeOnly?: boolean) {
  const qs = activeOnly ? '?active=true' : '';
  return nestGet<ApiFiscalClassification[]>(`/fiscal-classifications${qs}`);
}

export function apiCreateFiscalClassification(
  body: Omit<ApiFiscalClassification, 'id' | 'createdAt' | 'updatedAt'>,
) {
  return nestPost<ApiFiscalClassification>('/fiscal-classifications', body);
}

export function apiUpdateFiscalClassification(
  id: string,
  body: Partial<Omit<ApiFiscalClassification, 'id' | 'createdAt' | 'updatedAt'>>,
) {
  return nestPatch<ApiFiscalClassification>(`/fiscal-classifications/${id}`, body);
}

export function apiListCfops(activeOnly?: boolean) {
  const qs = activeOnly ? '?active=true' : '';
  return nestGet<ApiCfopCode[]>(`/cfops${qs}`);
}

export function apiCreateCfop(body: {
  code: string;
  description: string;
  operation: ApiCfopCode['operation'];
  active?: boolean;
}) {
  return nestPost<ApiCfopCode>('/cfops', body);
}

export function apiUpdateCfop(
  id: string,
  body: Partial<{
    code: string;
    description: string;
    operation: ApiCfopCode['operation'];
    active: boolean;
  }>,
) {
  return nestPatch<ApiCfopCode>(`/cfops/${id}`, body);
}

export function apiListFecps(activeOnly?: boolean) {
  const qs = activeOnly ? '?active=true' : '';
  return nestGet<ApiFecpRule[]>(`/fecps${qs}`);
}

export function apiCreateFecp(body: {
  uf: string;
  description: string;
  rate: number;
  active?: boolean;
}) {
  return nestPost<ApiFecpRule>('/fecps', body);
}

export function apiUpdateFecp(
  id: string,
  body: Partial<{ uf: string; description: string; rate: number; active: boolean }>,
) {
  return nestPatch<ApiFecpRule>(`/fecps/${id}`, body);
}

/* ── Fase 3 P2: Fiscal issuer + logs + tax tables ──────── */

export type ApiFiscalIssuerSettings = {
  emitenteName: string;
  cnpj: string;
  ie: string;
  im: string;
  cMun: string;
  municipio: string;
  uf: string;
  certificateFileName: string;
  certificateBase64: string;
  certificatePassword: string;
  hasCertificatePassword?: boolean;
  cscId: string;
  cscToken: string;
  hasCscToken?: boolean;
  environment: 'homologacao' | 'producao';
  nfeSeries: string;
  nfceSeries: string;
  nfseSeries: string;
  cteSeries: string;
  mdfeSeries: string;
  cbsRateBase: number;
  ibsRateBase: number;
  issqnRateDefault: number;
  issqnRetainedRate: number;
  issqnMunicipalCode: string;
  storageMode: 'local' | 'cloud' | 'both';
  localRootPath: string;
  localXmlPath: string;
  localLogPath: string;
  localPdfPath: string;
  localPdvPath: string;
  cloudEnabled: boolean;
  cloudBucketHint: string;
  updatedAt: string;
};

export type ApiFiscalLogEntry = {
  id: string;
  at: string;
  family: 'nfe' | 'nfce' | 'nfse' | 'cte' | 'mdfe' | 'other';
  action: string;
  detail: string;
  refId?: string;
};

export type ApiFiscalCstCode = {
  code: string;
  name: string;
  description: string;
  active: boolean;
};

export type ApiFiscalCClassTrib = {
  code: string;
  name: string;
  cstCode: string;
  description: string;
  linkLc?: string;
  active: boolean;
};

export type ApiTaxTables = {
  csts: ApiFiscalCstCode[];
  cClassTribs: ApiFiscalCClassTrib[];
  lastSyncAt: string;
  lastSyncSource: 'seed' | 'api' | 'manual';
  lastSyncMessage: string;
};

export function apiGetFiscalIssuerSettings() {
  return nestGet<ApiFiscalIssuerSettings>('/fiscal/issuer-settings');
}

export function apiPutFiscalIssuerSettings(
  body: Partial<
    Omit<ApiFiscalIssuerSettings, 'updatedAt' | 'hasCertificatePassword' | 'hasCscToken'>
  >,
) {
  return nestPut<ApiFiscalIssuerSettings>('/fiscal/issuer-settings', body);
}

export function apiListFiscalLogs() {
  return nestGet<ApiFiscalLogEntry[]>('/fiscal/logs');
}

export function apiAppendFiscalLog(body: {
  family: ApiFiscalLogEntry['family'];
  action: string;
  detail: string;
  refId?: string;
}) {
  return nestPost<ApiFiscalLogEntry>('/fiscal/logs', body);
}

export function apiGetTaxTables() {
  return nestGet<ApiTaxTables>('/fiscal/tax-tables');
}

export function apiPutTaxTables(body: {
  csts: Array<{
    code: string;
    name: string;
    description?: string;
    active?: boolean;
  }>;
  cClassTribs: Array<{
    code: string;
    name: string;
    cstCode?: string;
    description?: string;
    linkLc?: string;
    active?: boolean;
  }>;
}) {
  return nestPut<ApiTaxTables>('/fiscal/tax-tables', body);
}

export function apiSyncTaxTables() {
  return nestPost<ApiTaxTables>('/fiscal/tax-tables/sync');
}

/* ── Fase 3 P3: CRM ────────────────────────────────────── */

export type ApiCrmStage = 'leads' | 'waiting' | 'attending' | 'payment' | 'won' | 'lost';
export type ApiCrmLeadSource = 'demo' | 'partner' | 'contact' | 'manual' | 'careers';
export type ApiCrmActivityKind =
  | 'activity'
  | 'comment'
  | 'message'
  | 'schedule'
  | 'task'
  | 'system';

export type ApiCrmLead = {
  id: string;
  name: string;
  email: string;
  whatsapp: string;
  source: ApiCrmLeadSource;
  interest: string;
  value: number;
  stage: ApiCrmStage;
  ownerSellerId: string | null;
  ownerName: string;
  claimedAt?: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  externalRef?: string;
  customerId?: string;
  paidAt?: string | null;
  graduation?: string;
  polo?: string;
  sourceInfo?: string;
  hideContact?: boolean;
};

export type ApiCrmActivity = {
  id: string;
  leadId: string;
  kind: ApiCrmActivityKind;
  title: string;
  body: string;
  fromSellerId: string | null;
  fromName: string;
  createdAt: string;
  dueAt?: string | null;
};

export type ApiCrmMessage = {
  id: string;
  kind: 'lead' | 'sellers';
  leadId?: string;
  sellerPairKey?: string;
  fromSellerId: string | null;
  fromName: string;
  fromLead?: boolean;
  text: string;
  body?: string;
  createdAt: string;
};

export type ApiCrmSellerProfile = {
  sellerId: string;
  displayName: string;
  handle: string;
  bio: string;
  avatarUrl: string;
  coverUrl: string;
  city: string;
  specialty: string;
  whatsapp: string;
  instagram: string;
  linkedin: string;
  website: string;
  publicProfile: boolean;
  updatedAt: string;
};

export function apiListCrmLeads(stage?: ApiCrmStage) {
  const qs = stage ? `?stage=${stage}` : '';
  return nestGet<ApiCrmLead[]>(`/crm/leads${qs}`);
}

export function apiGetCrmLead(id: string) {
  return nestGet<ApiCrmLead>(`/crm/leads/${id}`);
}

export function apiCreateCrmLead(body: {
  name: string;
  email?: string;
  whatsapp?: string;
  source: ApiCrmLeadSource;
  interest?: string;
  value?: number;
  notes?: string;
  externalRef?: string;
  stage?: ApiCrmStage;
  graduation?: string;
  polo?: string;
  sourceInfo?: string;
  hideContact?: boolean;
  ownerSellerId?: string;
}) {
  return nestPost<ApiCrmLead>('/crm/leads', body);
}

export function apiUpdateCrmLead(
  id: string,
  body: Partial<{
    name: string;
    email: string;
    whatsapp: string;
    interest: string;
    value: number;
    notes: string;
    graduation: string;
    polo: string;
    sourceInfo: string;
    hideContact: boolean;
  }>,
) {
  return nestPatch<ApiCrmLead>(`/crm/leads/${id}`, body);
}

export function apiClaimCrmLead(id: string, body: { sellerId: string }) {
  return nestPost<ApiCrmLead>(`/crm/leads/${id}/claim`, body);
}

export function apiMoveCrmLead(id: string, body: { stage: ApiCrmStage; sellerId?: string }) {
  return nestPost<ApiCrmLead>(`/crm/leads/${id}/move`, body);
}

export function apiListCrmActivities(leadId: string) {
  return nestGet<ApiCrmActivity[]>(`/crm/leads/${leadId}/activities`);
}

export function apiCreateCrmActivity(
  leadId: string,
  body: {
    kind: Exclude<ApiCrmActivityKind, 'system'>;
    title?: string;
    body: string;
    sellerId: string;
    dueAt?: string;
  },
) {
  return nestPost<ApiCrmActivity>(`/crm/leads/${leadId}/activities`, body);
}

export function apiListCrmLeadMessages(leadId: string) {
  return nestGet<ApiCrmMessage[]>(`/crm/leads/${leadId}/messages`);
}

export function apiSendCrmLeadMessage(
  leadId: string,
  body: { text?: string; body?: string; sellerId: string; asLead?: boolean },
) {
  return nestPost<ApiCrmMessage>(`/crm/leads/${leadId}/messages`, body);
}

export function apiListCrmSellerMessages(sellerA: string, sellerB: string) {
  const params = new URLSearchParams({ sellerA, sellerB });
  return nestGet<ApiCrmMessage[]>(`/crm/messages/sellers?${params}`);
}

export function apiSendCrmSellerMessage(body: {
  fromSellerId: string;
  toSellerId: string;
  text?: string;
  body?: string;
}) {
  return nestPost<ApiCrmMessage>('/crm/messages/sellers', body);
}

export function apiGetCrmProfile(sellerId: string) {
  return nestGet<ApiCrmSellerProfile>(`/crm/profiles/${sellerId}`);
}

export function apiPutCrmProfile(
  sellerId: string,
  body: {
    displayName: string;
    handle?: string;
    bio?: string;
    avatarUrl?: string;
    coverUrl?: string;
    city?: string;
    specialty?: string;
    whatsapp?: string;
    instagram?: string;
    linkedin?: string;
    website?: string;
    publicProfile?: boolean;
  },
) {
  return nestPut<ApiCrmSellerProfile>(`/crm/profiles/${sellerId}`, body);
}

/* ── Fase 3 P3: E-commerce ─────────────────────────────── */

export type ApiEcommerceChannelId =
  | 'mercadolivre'
  | 'shopee'
  | 'ifood'
  | 'amazon'
  | 'tray';

export type ApiEcommerceChannel = {
  id: ApiEcommerceChannelId;
  kind: 'marketplace' | 'hub';
  name: string;
  blurb: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  storeName: string;
  lastSyncAt: string;
  message: string;
  openOrders: number;
  activeListings: number;
  credentials: Record<string, string>;
};

export type ApiEcommerceListing = {
  id: string;
  channelId: ApiEcommerceChannelId;
  stockId: string;
  externalId: string;
  title: string;
  sku: string;
  price: number;
  qty: number;
  images: string[];
  status: 'active' | 'paused' | 'error' | 'draft';
  syncedAt: string;
  message: string;
};

export type ApiEcommerceOrder = {
  id: string;
  channelId: ApiEcommerceChannelId;
  externalId: string;
  customerName: string;
  amount: number;
  status: 'new' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
  createdAt: string;
  stockId?: string;
  listingId?: string;
  qty?: number;
};

export function apiListEcommerceChannels() {
  return nestGet<ApiEcommerceChannel[]>('/ecommerce/channels');
}

export function apiGetEcommerceChannel(id: ApiEcommerceChannelId) {
  return nestGet<ApiEcommerceChannel>(`/ecommerce/channels/${id}`);
}

export function apiPutEcommerceChannel(
  id: ApiEcommerceChannelId,
  body: { storeName?: string; credentials?: Record<string, string> },
) {
  return nestPut<ApiEcommerceChannel>(`/ecommerce/channels/${id}`, body);
}

export function apiConnectEcommerceChannel(
  id: ApiEcommerceChannelId,
  body?: { credentials?: Record<string, string> },
) {
  return nestPost<ApiEcommerceChannel>(`/ecommerce/channels/${id}/connect`, body ?? {});
}

export function apiDisconnectEcommerceChannel(id: ApiEcommerceChannelId) {
  return nestPost<ApiEcommerceChannel>(`/ecommerce/channels/${id}/disconnect`);
}

export function apiSyncEcommerceChannel(id: ApiEcommerceChannelId) {
  return nestPost<ApiEcommerceChannel>(`/ecommerce/channels/${id}/sync`);
}

export function apiListEcommerceListings(channelId?: ApiEcommerceChannelId) {
  const qs = channelId ? `?channelId=${channelId}` : '';
  return nestGet<ApiEcommerceListing[]>(`/ecommerce/listings${qs}`);
}

export function apiGetEcommerceListing(id: string) {
  return nestGet<ApiEcommerceListing>(`/ecommerce/listings/${id}`);
}

export function apiCreateEcommerceListing(body: {
  channelId: ApiEcommerceChannelId;
  stockId: string;
  externalId?: string;
  title?: string;
  sku?: string;
  price?: number;
  qty?: number;
  images?: string[];
  status?: ApiEcommerceListing['status'];
}) {
  return nestPost<ApiEcommerceListing>('/ecommerce/listings', body);
}

export function apiUpdateEcommerceListing(
  id: string,
  body: Partial<{
    title: string;
    sku: string;
    price: number;
    qty: number;
    images: string[];
    status: ApiEcommerceListing['status'];
    message: string;
  }>,
) {
  return nestPatch<ApiEcommerceListing>(`/ecommerce/listings/${id}`, body);
}

export function apiDeleteEcommerceListing(id: string) {
  return nestDelete<{ id: string; deleted: boolean }>(`/ecommerce/listings/${id}`);
}

export function apiListEcommerceOrders(channelId?: ApiEcommerceChannelId) {
  const qs = channelId ? `?channelId=${channelId}` : '';
  return nestGet<ApiEcommerceOrder[]>(`/ecommerce/orders${qs}`);
}
