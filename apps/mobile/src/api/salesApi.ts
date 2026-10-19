import { apiRequest } from './client';

export type Customer = {
  id: string;
  name: string;
  phone?: string;
  document?: string;
  email?: string;
  active?: boolean;
};

export type ExternalSaleLineInput = {
  stockId?: string | null;
  name: string;
  qty: number;
  unitPrice: number;
  discount?: number;
  imei?: string;
  attributes?: Array<{ id: string; name: string; value: string }>;
};

export type ExternalSalePayload = {
  requestId: string;
  customerId?: string | null;
  customerName: string;
  customerPhone?: string;
  customerDocument?: string;
  paymentMethod: string;
  installments?: number;
  discount?: number;
  notes?: string;
  lines: ExternalSaleLineInput[];
};

export type ExternalSaleListItem = {
  id: string;
  customerName?: string;
  amount?: number;
  payment?: string;
  status?: string;
  createdAt?: string;
  items?: string;
};

type Auth = { token: string; storeId: string };

export function newSaleRequestId(): string {
  const rand = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return `mob-${Date.now().toString(36)}-${rand}`.slice(0, 80);
}

export async function listCustomers(opts: Auth & { q?: string }): Promise<Customer[]> {
  const qs = opts.q?.trim() ? `?q=${encodeURIComponent(opts.q.trim())}` : '';
  return apiRequest(`/customers${qs}`, { token: opts.token, storeId: opts.storeId });
}

export async function createCustomer(
  opts: Auth & { name: string; phone?: string; document?: string },
): Promise<Customer> {
  return apiRequest('/customers', {
    method: 'POST',
    token: opts.token,
    storeId: opts.storeId,
    body: {
      name: opts.name,
      phone: opts.phone ?? '',
      document: opts.document ?? '',
      documentType: 'cpf',
    },
  });
}

export async function listExternalSales(opts: Auth): Promise<ExternalSaleListItem[]> {
  return apiRequest('/sales/external', { token: opts.token, storeId: opts.storeId });
}

export async function createExternalSale(
  opts: Auth & { body: ExternalSalePayload },
): Promise<{ id: string }> {
  return apiRequest('/sales/external', {
    method: 'POST',
    token: opts.token,
    storeId: opts.storeId,
    body: opts.body,
  });
}
