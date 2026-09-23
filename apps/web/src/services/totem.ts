import { enqueueKitchenOrder } from '../data/kitchenOrderStore';
import type { PickedAttribute } from '../data/attributeStore';
import { formatPicked } from '../data/attributeStore';
import { enqueueTotemLead } from '../data/posQueueStore';
import { getTotemSettings } from '../data/totemSettings';
import { apiSubmitTotemLead } from './erpApi';

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
  let customerNotified = false;
  let ticketId: string;

  try {
    const result = await apiSubmitTotemLead({
      customerName: payload.customerName,
      customerPhone: payload.customerPhone,
      productName: payload.productName,
      attributes: payload.attributes,
      color: payload.color,
      storage: payload.storage,
      fulfillment: payload.fulfillment,
      payment: payload.payment,
      installment: payload.installment,
      priceLabel: payload.priceLabel,
    });
    ticketId = result.id;
    customerNotified = Boolean(result.customerNotified);
    enqueueTotemLead({ ...payload, source: 'totem', id: ticketId });
  } catch {
    const ticket = enqueueTotemLead(payload);
    ticketId = ticket.id;
    customerNotified = false;
  }

  if (shouldSendToKitchen()) {
    try {
      enqueueKitchenOrder({
        channel: 'totem',
        customerName: payload.customerName,
        sourceTicketId: ticketId,
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

  return { ticketId, customerNotified };
}
