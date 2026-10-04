import { nestRequest } from "./nestClient";
import type { StoreSegmentId } from "../data/storeSegment";
export type CommercialProfile = {
  segmentId: StoreSegmentId;
  enabled: boolean;
  appleRules: boolean;
  tradeIn: boolean;
  supplierComparison: boolean;
  catalog: boolean;
  readyMarkup: number;
  orderMarkup: number;
  upgradeMarkup: number;
  usedWarrantyMonths: number;
  readyUsedWarrantyMonths: number;
  receiptDays: number[];
  arrivalTime: string;
  cutoffTime: string;
  routes: string[];
  categories: string[];
};
export type CommercialOffer = {
  id?: string;
  active?: boolean;
  supplierId: string;
  category: string;
  brand: string;
  model: string;
  capacity: string;
  color: string;
  configuration: string;
  condition: string;
  cost: number;
  warrantyMonths: number;
  warrantyProvider: string;
  available: boolean;
  sourceAt: string;
  validUntil: string;
};
export type Assessment = {
  batteryHealth: number | null;
  screen: string;
  housing: string;
  cameras: string;
  faceId: string;
  functioning: string;
  originalParts: string;
  repairs: string;
  damage: string;
  notes: string;
  assessedAt: string;
};
export type TradeAssessment = {
  referenceOfferId: string;
  deviceName: string;
  imei: string;
  offerValue: number;
  assessment: Assessment;
};
export type CommercialOrderInput = {
  requestId: string;
  customerId: string;
  offerId: string;
  mode: "ready" | "order";
  stockId: string | null;
  qty: number;
  tradeIn: TradeAssessment | null;
  notes: string;
};
export type CommercialOrder = {
  id: string;
  customer_id: string;
  status: string;
  sale_id: string | null;
  paid_amount: number | string;
  created_at: string;
  details: CommercialOrderInput & {
    offer: CommercialOffer;
    unitPrice: number;
    cost: number;
    total: number;
    netTotal: number;
    expectedAt: string | null;
    route: string;
    tracking: string;
    receivedAt: string | null;
    warranty: { provider: string; months: number; text: string };
    profile: CommercialProfile;
  };
  events?: {
    id: string;
    action: string;
    created_at: string;
    details: unknown;
  }[];
  payments?: {
    id: string;
    kind: string;
    amount: number | string;
    method: string;
    created_at: string;
  }[];
};
export type CommercialState = {
  storeId: string;
  storeName: string;
  segmentId: string;
  profile: CommercialProfile | null;
  canEdit: boolean;
  canConfigure: boolean;
  suppliers: { id: string; name: string }[];
  customers: { id: string; name: string }[];
  accounts: { id: string; name: string }[];
  stock: {
    id: string;
    name: string;
    color: string;
    capacity: string;
    qty: number;
    available_qty: number;
    cost: number;
  }[];
  offers: CommercialOffer[];
  orders: CommercialOrder[];
};
export function commercialRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
) {
  return nestRequest<T>("/commercial" + path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
}
