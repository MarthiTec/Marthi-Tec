import { nestRequest } from '../services/nestClient';

export type BillingProviderStatus = {
  activeProvider: 'manual' | 'stripe' | 'asaas' | 'mercadopago';
  stripe: {
    configured: boolean;
    hasSecretKey: boolean;
    hasWebhookSecret: boolean;
    hasPublishableKey: boolean;
    portalReady: boolean;
    missingEnv: string[];
  };
  asaas: { configured: boolean; hasApiKey: boolean; missingEnv: string[] };
  mercadoPago: { configured: boolean; hasAccessToken: boolean; missingEnv: string[] };
  pix: { manualReceiveConfiguredHint: string; automaticProvider: string };
  gates: string[];
};

export type ClientSubscription = {
  id: string;
  clientAccountId: string;
  storeId: string | null;
  tradeName: string;
  email: string;
  accountStatus: string;
  planId: string;
  modules: string[];
  status: string;
  billingCycle: string;
  amount: number;
  currency: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  nextChargeAt: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  provider: string;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  paymentMethodPreference: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type BillingInvoice = {
  id: string;
  clientAccountId: string;
  subscriptionId: string | null;
  tradeName?: string;
  amount: number;
  currency: string;
  status: string;
  description: string;
  periodStart: string | null;
  periodEnd: string | null;
  dueAt: string | null;
  paidAt: string | null;
  paymentMethod: string | null;
  provider: string;
  providerInvoiceId: string | null;
  transactionRef: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BillingPaymentEvent = {
  id: string;
  eventType: string;
  provider: string;
  providerEventId: string | null;
  createdAt: string;
};

export async function fetchAdminSubscriptions() {
  return nestRequest<{ provider: BillingProviderStatus; subscriptions: ClientSubscription[] }>(
    '/admin/subscriptions',
  );
}

export async function fetchAdminSubscriptionDetail(clientId: string) {
  return nestRequest<{
    provider: BillingProviderStatus;
    subscription: ClientSubscription;
    invoices: BillingInvoice[];
    paymentEvents: BillingPaymentEvent[];
  }>(`/admin/subscriptions/${encodeURIComponent(clientId)}`);
}

export async function patchAdminSubscription(
  clientId: string,
  body: Partial<{
    planId: string;
    amount: number;
    billingCycle: 'monthly' | 'yearly';
    status: ClientSubscription['status'];
    nextChargeAt: string | null;
    paymentMethodPreference: 'pix' | 'card' | 'boleto' | 'mixed';
    provider: 'manual' | 'stripe' | 'asaas' | 'mercadopago';
    providerCustomerId: string | null;
    providerSubscriptionId: string | null;
    notes: string;
  }>,
) {
  return nestRequest<ClientSubscription>(`/admin/subscriptions/${encodeURIComponent(clientId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function cancelAdminSubscription(clientId: string, immediate = false) {
  return nestRequest<ClientSubscription>(`/admin/subscriptions/${encodeURIComponent(clientId)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ immediate }),
  });
}

export async function openAdminStripePortal(clientId: string) {
  return nestRequest<{ url: string }>(`/admin/subscriptions/${encodeURIComponent(clientId)}/portal`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function fetchAdminInvoices(clientId?: string) {
  const q = clientId ? `?clientId=${encodeURIComponent(clientId)}` : '';
  return nestRequest<BillingInvoice[]>(`/admin/billing/invoices${q}`);
}

export async function createAdminInvoice(body: {
  clientAccountId: string;
  amount: number;
  description?: string;
  status?: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  dueAt?: string;
  paidAt?: string;
  paymentMethod?: 'pix' | 'card' | 'boleto' | 'mixed';
  transactionRef?: string;
}) {
  return nestRequest<BillingInvoice>('/admin/billing/invoices', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function fetchStoreBillingSubscription() {
  return nestRequest<{
    subscription: ClientSubscription;
    invoices: BillingInvoice[];
    provider: { activeProvider: string; portalAvailable: boolean; gates: string[] };
  }>('/billing/subscription');
}

export async function openStoreBillingPortal() {
  return nestRequest<{ url: string }>('/billing/portal', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function formatBillingDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatBillingMoney(amount: number, currency = 'BRL'): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(amount || 0);
}
