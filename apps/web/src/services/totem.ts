import { enqueueTotemLead } from '../data/posQueueStore';
import type { PickedAttribute } from '../data/attributeStore';
import { edgeApiUrl } from './config';

const API_URL = edgeApiUrl();

export type TotemLeadRequest = {
  customerName: string;
  customerPhone: string;
  productName: string;
  attributes?: PickedAttribute[];
  color: string;
  storage: string;
  fulfillment: string;
  payment: string;
  installment: string | null;
  priceLabel: string;
};

export async function submitTotemLead(payload: TotemLeadRequest) {
  const ticket = enqueueTotemLead(payload);
  let customerNotified = false;

  try {
    const response = await fetch(`${API_URL}/api/v1/totem/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(2500),
    });
    const json = (await response.json()) as {
      success?: boolean;
      data?: { customerNotified?: boolean };
    };
    customerNotified = Boolean(json.data?.customerNotified);
  } catch {
    customerNotified = false;
  }

  return { ticketId: ticket.id, customerNotified };
}
