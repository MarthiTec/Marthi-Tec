import { apiRequest } from './client';

export type BillingInvoice = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  description: string;
  dueAt: string | null;
  paidAt: string | null;
  paymentMethod: string | null;
  createdAt: string;
};

export type ClientSubscription = {
  id: string;
  planId: string;
  status: string;
  billingCycle: string;
  amount: number;
  currency: string;
  nextChargeAt: string | null;
  paymentMethodPreference: string;
};

export type BillingPixPayload = {
  keyType: string;
  keyValue: string;
  receiverName: string;
  bankName: string;
  amount: number | null;
  currency: string;
  brCode: string;
  qrDataUrl: string | null;
  format: string;
  source: string;
  instructions: string;
};

export type StoreBillingPayload = {
  subscription: ClientSubscription;
  invoices: BillingInvoice[];
  amountDue: number | null;
  pix: BillingPixPayload;
  provider: { activeProvider: string; portalAvailable: boolean; gates: string[] };
};

export function fetchStoreBilling(token: string, storeId: string | null) {
  return apiRequest<StoreBillingPayload>('/billing/subscription', { token, storeId });
}
