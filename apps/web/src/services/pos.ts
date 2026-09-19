import { readJson } from './http';
import { edgeApiUrl } from './config';

const API_URL = edgeApiUrl();

export type PosTicket = {
  id: string;
  source: 'totem' | 'manual';
  status: 'open' | 'sold' | 'cancelled';
  customerName: string;
  customerPhone: string;
  productName: string;
  color: string;
  storage: string;
  fulfillment: string;
  payment: string;
  installment: string | null;
  priceLabel: string;
  createdAt: string;
  closedAt: string | null;
};

export async function fetchPosTickets(): Promise<PosTicket[]> {
  const response = await fetch(`${API_URL}/api/v1/pos/tickets`);
  const json = await readJson<{
    success: boolean;
    data?: { items: PosTicket[] };
    error?: { message?: string };
  }>(response);
  if (!response.ok || !json.success) {
    throw new Error(json.error?.message ?? 'Não foi possível carregar o PDV.');
  }
  return json.data?.items ?? [];
}

export async function updatePosTicket(id: string, status: PosTicket['status']) {
  const response = await fetch(`${API_URL}/api/v1/pos/tickets/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  const json = await readJson<{
    success: boolean;
    data?: PosTicket;
    error?: { message?: string };
  }>(response);
  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error?.message ?? 'Não foi possível atualizar o ticket.');
  }
  return json.data;
}
