import type { PickedAttribute } from './attributeStore';
import { formatPicked } from './attributeStore';

export type QueueTicketStatus = 'open' | 'sold' | 'cancelled';

export type QueueTicket = {
  id: string;
  source: 'totem' | 'manual';
  status: QueueTicketStatus;
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
  createdAt: string;
  closedAt: string | null;
};

const STORAGE_KEY = 'marthi.pos.queue.v1';
export const POS_QUEUE_EVENT = 'marthi-pos-updated';

function uid() {
  return `PDV-${Date.now().toString(36).toUpperCase()}`;
}

function load(): QueueTicket[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueueTicket[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(items: QueueTicket[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 300)));
  window.dispatchEvent(new Event(POS_QUEUE_EVENT));
}

export function listQueueTickets() {
  return load();
}

/** Substitui a fila local pelos tickets do Nest (bootstrap / sync). */
export function replaceQueueTickets(items: QueueTicket[]) {
  save(Array.isArray(items) ? items.slice(0, 300) : []);
}

export function enqueueTotemLead(
  input: Omit<QueueTicket, 'id' | 'status' | 'createdAt' | 'closedAt' | 'source'> & {
    source?: QueueTicket['source'];
    id?: string;
  },
) {
  const ticket: QueueTicket = {
    ...input,
    source: input.source ?? 'totem',
    id: input.id ?? uid(),
    status: 'open',
    createdAt: new Date().toISOString(),
    closedAt: null,
  };
  save([ticket, ...load().filter((item) => item.id !== ticket.id)]);
  return ticket;
}

export function updateQueueTicket(id: string, status: QueueTicketStatus) {
  const items = load();
  const next = items.map((item) =>
    item.id === id
      ? {
          ...item,
          status,
          closedAt: status === 'open' ? null : new Date().toISOString(),
        }
      : item,
  );
  save(next);
  return next.find((item) => item.id === id) ?? null;
}

export function ticketVariation(ticket: Pick<QueueTicket, 'attributes' | 'color' | 'storage' | 'fulfillment'>) {
  if (ticket.attributes?.length) return formatPicked(ticket.attributes);
  return [ticket.color, ticket.storage, ticket.fulfillment].filter(Boolean).join(' · ');
}

export function mergeQueueTickets(local: QueueTicket[], remote: QueueTicket[]) {
  const byId = new Set(local.map((item) => item.id));
  const fingerprints = new Set(
    local.map((item) => `${item.customerPhone}|${item.productName}|${item.status}`),
  );
  const extra = remote.filter((item) => {
    if (byId.has(item.id)) return false;
    return !fingerprints.has(`${item.customerPhone}|${item.productName}|${item.status}`);
  });
  return [...local, ...extra].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
