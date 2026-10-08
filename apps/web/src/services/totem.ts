import type {DeliveryAddress} from '../data/pickup';
import { enqueueKitchenOrder } from '../data/kitchenOrderStore';
import type { PickedAttribute } from '../data/attributeStore';
import { formatPicked } from '../data/attributeStore';
import { enqueueTotemLead } from '../data/posQueueStore';
import { getTotemSettings } from '../data/totemSettings';
import { apiSubmitTotemLead, type ApiTotemCartItem } from './erpApi';

export type TotemLeadRequest = {
  destination?:'cashier'|'whatsapp';
  stockId?:string;pickupMethodId?:string;deliveryAddress?:DeliveryAddress;
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
  cashPrice?: number;
  ticketSenha?: string;
  sentToCashier?: boolean;
  /** Destino WhatsApp da loja (painel). Sobrescreve EVOLUTION_STORE_NUMBER. */
  storeWhatsApp?: string;
  notifyCustomer?: boolean;
  locationLabel?: string;
};

function shouldSendToKitchen() {
  const settings = getTotemSettings();
  return settings.vertical === 'food';
}

const pendingRequests=new Map<string,string>();
export async function submitTotemLead(payload: TotemLeadRequest) {
  const signature=JSON.stringify(payload);
  const requestKey=pendingRequests.get(signature)??crypto.randomUUID();
  pendingRequests.set(signature,requestKey);
  const result = await apiSubmitTotemLead({
    requestKey,destination:payload.destination,
    stockId:payload.stockId,pickupMethodId:payload.pickupMethodId,deliveryAddress:payload.deliveryAddress,
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
  pendingRequests.delete(signature);
  const ticketId = result.id;
  const customerNotified = Boolean(result.customerNotified);
  enqueueTotemLead({
    ...payload,
    source: 'totem',
    id: ticketId,
    cashPrice: result.quotedPrice ?? payload.cashPrice,
    ticketSenha: payload.ticketSenha,
    sentToCashier: payload.sentToCashier ?? true,
  });

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

  return { ticketId, notificationWarning:result.notificationWarning,customerNotified,trackingToken:result.trackingToken,quotedPrice:result.quotedPrice,whatsappUrl:result.whatsappUrl };
}

export type TotemCartRequest = {
  destination: 'cashier' | 'whatsapp';
  customerName: string;
  customerPhone: string;
  payment: string;
  installment: string | null;
  items: (ApiTotemCartItem & { productName: string })[];
};

/** Carrinho do totem: o servidor cota cada item e grava tudo com a mesma senha. */
export async function submitTotemCart(payload: TotemCartRequest) {
  const signature = JSON.stringify(payload);
  const requestKey = pendingRequests.get(signature) ?? crypto.randomUUID();
  pendingRequests.set(signature, requestKey);
  const result = await apiSubmitTotemLead({
    requestKey,
    destination: payload.destination,
    items: payload.items.map(({ productName: _name, ...item }) => item),
    customerName: payload.customerName,
    customerPhone: payload.customerPhone,
    productName: payload.items[0]?.productName ?? 'Produto',
    color: '',
    storage: '',
    fulfillment: '',
    payment: payload.payment,
    installment: payload.installment,
    priceLabel: '',
  });
  pendingRequests.delete(signature);

  if (shouldSendToKitchen()) {
    try {
      enqueueKitchenOrder({
        channel: 'totem',
        customerName: payload.customerName,
        sourceTicketId: result.id,
        lines: payload.items.map((item) => ({
          name: item.productName,
          qty: item.qty,
          detail: formatPicked((item.attributes ?? []) as PickedAttribute[]),
        })),
      });
    } catch {
      /* fila local não deve bloquear o pedido do totem */
    }
  }

  return {
    ticketId: result.id,
    notificationWarning: result.notificationWarning,
    customerNotified: Boolean(result.customerNotified),
    trackingToken: result.trackingToken,
    whatsappUrl: result.whatsappUrl,
    total: result.total ?? 0,
  };
}
