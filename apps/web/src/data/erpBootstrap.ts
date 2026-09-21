import {
  replaceAdminState,
  type Customer,
  type FinanceEntry,
  type PaymentMethod,
  type PriceTable,
  type SalesOrder,
  type StockItem,
} from './adminStore';
import { replaceAttributes } from './attributeStore';
import { replaceWorkOrders } from './osStore';
import { replaceOperatorProfileCache } from './operatorProfile';
import { replaceStoreEntitlement } from './storePlan';
import { replaceTotemSettings } from './totemSettings';
import {
  apiGetOperatorProfile,
  apiGetStorePlan,
  apiGetTotemSettings,
  apiListAttributes,
  apiListCustomers,
  apiListFinance,
  apiListOrders,
  apiListPayments,
  apiListPriceTables,
  apiListStock,
  apiListWorkOrders,
} from '../services/erpApi';
import { isNestAuthed } from '../services/nestClient';

export const ERP_BOOTSTRAP_EVENT = 'marthi-erp-bootstrap';

export type ErpBootstrapState = {
  loading: boolean;
  ready: boolean;
  error: string | null;
};

let bootstrapState: ErpBootstrapState = {
  loading: false,
  ready: false,
  error: null,
};

export function getErpBootstrapState() {
  return bootstrapState;
}

function setBootstrap(next: ErpBootstrapState) {
  bootstrapState = next;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(ERP_BOOTSTRAP_EVENT));
  }
}

/** Carrega ERP/OS/financeiro do Nest e substitui o cache local. */
export async function bootstrapErpFromApi(): Promise<boolean> {
  if (!isNestAuthed()) {
    setBootstrap({ loading: false, ready: false, error: null });
    return false;
  }

  setBootstrap({ loading: true, ready: false, error: null });

  try {
    const [
      customers,
      stock,
      orders,
      finance,
      priceTables,
      payments,
      attributes,
      workOrders,
      plan,
      totemSettings,
      profile,
    ] = await Promise.all([
      apiListCustomers(),
      apiListStock(),
      apiListOrders(),
      apiListFinance(),
      apiListPriceTables(),
      apiListPayments(),
      apiListAttributes(),
      apiListWorkOrders(),
      apiGetStorePlan(),
      apiGetTotemSettings(),
      apiGetOperatorProfile(),
    ]);

    replaceAdminState({
      customers: customers as Customer[],
      stock: stock as StockItem[],
      orders: orders as SalesOrder[],
      finance: finance as FinanceEntry[],
      priceTables: priceTables as PriceTable[],
      payments: payments as PaymentMethod[],
    });
    replaceAttributes(attributes);
    replaceWorkOrders(workOrders);
    replaceStoreEntitlement(plan);
    replaceTotemSettings(totemSettings);
    replaceOperatorProfileCache(profile);

    setBootstrap({ loading: false, ready: true, error: null });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao sincronizar ERP.';
    setBootstrap({ loading: false, ready: false, error: message });
    console.error('[erp] bootstrap failed', error);
    return false;
  }
}

export async function refreshAdminSlices(slices?: Array<'customers' | 'stock' | 'orders' | 'finance' | 'pricing'>) {
  if (!isNestAuthed()) return;
  const want = new Set(slices ?? ['customers', 'stock', 'orders', 'finance', 'pricing']);
  const [customers, stock, orders, finance, priceTables, payments] = await Promise.all([
    want.has('customers') ? apiListCustomers() : Promise.resolve(null),
    want.has('stock') ? apiListStock() : Promise.resolve(null),
    want.has('orders') ? apiListOrders() : Promise.resolve(null),
    want.has('finance') ? apiListFinance() : Promise.resolve(null),
    want.has('pricing') ? apiListPriceTables() : Promise.resolve(null),
    want.has('pricing') ? apiListPayments() : Promise.resolve(null),
  ]);

  const { getAdminState } = await import('./adminStore');
  const current = getAdminState();
  replaceAdminState({
    customers: (customers as Customer[] | null) ?? current.customers,
    stock: (stock as StockItem[] | null) ?? current.stock,
    orders: (orders as SalesOrder[] | null) ?? current.orders,
    finance: (finance as FinanceEntry[] | null) ?? current.finance,
    priceTables: (priceTables as PriceTable[] | null) ?? current.priceTables,
    payments: (payments as PaymentMethod[] | null) ?? current.payments,
  });
}

export async function refreshWorkOrders() {
  if (!isNestAuthed()) return;
  const workOrders = await apiListWorkOrders();
  replaceWorkOrders(workOrders);
}
