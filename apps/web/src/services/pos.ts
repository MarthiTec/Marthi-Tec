import {
  apiListPosTickets,
  apiPatchPosTicket,
  type ApiPosTicket,
} from './erpApi';

export type PosTicket = ApiPosTicket;

export async function fetchPosTickets(): Promise<PosTicket[]> {
  const data = await apiListPosTickets();
  return data.items ?? [];
}

export async function updatePosTicket(id: string, status: PosTicket['status']) {
  return apiPatchPosTicket(id, status);
}
