import { nestGet, nestPost } from './nestClient';

/** Avaliação interna do aparelho de troca: vendedor pede, oficina avalia (sem custo), vendedor aprova ou recusa. */
export type TradeEvaluationStatus = 'pending' | 'evaluated' | 'approved' | 'rejected' | 'canceled';
export type TradeEvaluation = {
  id: string;
  status: TradeEvaluationStatus;
  customerId: string | null;
  customerName: string;
  deviceName: string;
  imei: string;
  capacity: string;
  color: string;
  requestNotes: string;
  requestedBy: string;
  batteryLevel: number | null;
  opened: boolean | null;
  cracked: boolean | null;
  evaluationNotes: string;
  suggestedPrice: number | null;
  evaluatedBy: string;
  evaluatedAt: string | null;
  approvedPrice: number | null;
  decisionNotes: string;
  decidedBy: string;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const TRADE_EVALUATION_STATUS_LABEL: Record<TradeEvaluationStatus, string> = {
  pending: 'Aguardando a oficina',
  evaluated: 'Avaliado · aguardando o vendedor',
  approved: 'Preço aprovado',
  rejected: 'Preço recusado',
  canceled: 'Cancelada',
};

const path = (id: string, action: string) => `/trade-evaluations/${encodeURIComponent(id)}/${action}`;

/** Esteira da oficina: pendentes e avaliadas (ainda sem decisão do vendedor). */
export const apiListTradeEvaluations = (status: 'open' | TradeEvaluationStatus | 'all' = 'open') => nestGet<TradeEvaluation[]>(`/trade-evaluations?status=${status}`);
export const apiTradeEvaluationByImei = (imei: string) => nestGet<TradeEvaluation | null>(`/trade-evaluations/by-imei/${encodeURIComponent(imei.replace(/\s+/g, ''))}`);
export const apiRequestTradeEvaluation = (body: { customerId?: string | null; customerName: string; deviceName: string; imei: string; capacity?: string; color?: string; notes?: string }) =>
  nestPost<TradeEvaluation>('/trade-evaluations', body);
export const apiEvaluateTrade = (id: string, body: { batteryLevel: number | null; opened: boolean; cracked: boolean; notes: string; suggestedPrice: number }) =>
  nestPost<TradeEvaluation>(path(id, 'evaluate'), body);
export const apiApproveTradeEvaluation = (id: string, body: { price?: number; notes?: string } = {}) => nestPost<TradeEvaluation>(path(id, 'approve'), body);
export const apiRejectTradeEvaluation = (id: string, notes = '') => nestPost<TradeEvaluation>(path(id, 'reject'), { notes });
export const apiCancelTradeEvaluation = (id: string) => nestPost<TradeEvaluation>(path(id, 'cancel'), {});
