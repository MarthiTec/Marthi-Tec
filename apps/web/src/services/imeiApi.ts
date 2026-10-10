import { nestGet, nestPost } from './nestClient';

/** Situação do aparelho: em estoque ou o tipo de saída (venda, bonificação, uso interno, perda). */
export type ImeiStatus = 'in_stock' | 'sale' | 'bonus' | 'internal' | 'loss';
export const IMEI_STATUS_LABEL: Record<ImeiStatus, string> = {
  in_stock: 'Em estoque',
  sale: 'Vendido',
  bonus: 'Bonificação',
  internal: 'Uso interno',
  loss: 'Perda / defeito',
};
export type ImeiWriteOffKind = 'bonus' | 'internal' | 'loss';

export type ImeiReportRow = {
  imei: string;
  productId: string;
  variationId: string | null;
  entryId: string;
  productName: string;
  brand: string;
  typeName: string;
  modelName: string;
  image: string;
  attrs: Record<string, string>;
  condition: string;
  batteryLevel: number | null;
  origin: string;
  originKind: 'company' | 'upgrade' | 'trade_in';
  entryDate: string;
  cost: number;
  price: number;
  status: ImeiStatus;
  outputId: string | null;
  exitDate: string;
  saleId: string;
  customerName: string;
  notes: string;
};

export type ImeiHistoryEvent = { at: string; type: string; label: string; detail: string; outputId?: string; canRevert?: boolean };
export type ImeiHistory = { imei: string; productId: string | null; productName: string; status: ImeiStatus | 'unknown'; events: ImeiHistoryEvent[] };

export const apiImeiReport = () => nestGet<ImeiReportRow[]>('/imei/report');
export const apiImeiHistory = (imei: string) => nestGet<ImeiHistory>(`/imei/${encodeURIComponent(imei)}/history`);
export const apiImeiWriteOff = (imei: string, body: { kind: ImeiWriteOffKind; notes: string }) =>
  nestPost<{ id: string; stockId: string; productName: string; history: ImeiHistory }>(`/imei/${encodeURIComponent(imei)}/write-off`, body);
export const apiImeiRevert = (outputId: string, reason: string) => nestPost<{ ok: true }>(`/imei/outputs/${encodeURIComponent(outputId)}/revert`, { reason });
