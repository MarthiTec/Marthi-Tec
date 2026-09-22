import { enqueueTotemLead } from '../data/posQueueStore';
import { enqueueKitchenOrder } from '../data/kitchenOrderStore';
import type { PickedAttribute } from '../data/attributeStore';
import { formatPicked } from '../data/attributeStore';
import { getTotemSettings } from '../data/totemSettings';
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
  /** Destino WhatsApp da loja (painel). Sobrescreve EVOLUTION_STORE_NUMBER. */
  storeWhatsApp?: string;
  notifyCustomer?: boolean;
  locationLabel?: string;
};

function shouldSendToKitchen() {
  const settings = getTotemSettings();
  return settings.vertical === 'food' || settings.printTicket || settings.offerFulfillment;
}

export async function submitTotemLead(payload: TotemLeadRequest) {
  const ticket = enqueueTotemLead(payload);
  let customerNotified = false;
  const settings = getTotemSettings();
  const body = {
    ...payload,
    storeWhatsApp: payload.storeWhatsApp || settings.storeWhatsApp || undefined,
    notifyCustomer:
      payload.notifyCustomer ?? settings.notifyCustomerOnLead,
    locationLabel: payload.locationLabel || settings.locationLabel || undefined,
  };

  if (shouldSendToKitchen()) {
    try {
      enqueueKitchenOrder({
        channel: 'totem',
        customerName: payload.customerName,
        sourceTicketId: ticket.id,
        lines: [
          {
            name: payload.productName,
            qty: 1,
            detail:
              formatPicked(payload.attributes ?? []) ||
              [payload.color, payload.storage, payload.fulfillment].filter(Boolean).join(' · '),
          },
        ],
      });
    } catch {
      /* fila local não deve bloquear o pedido do totem */
    }
  }

  try {
    const response = await fetch(`${API_URL}/api/v1/totem/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
