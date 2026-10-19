export type AuthUser = {
  id: string;
  email: string;
  name: string;
  picture: string | null;
  provider: 'google' | 'password';
  role?: string;
  clientAccountId?: string;
};

export type AuthSession = {
  token: string;
  user: AuthUser;
};

export type StoreRow = {
  id: string;
  tradeName: string;
  legalName?: string;
  isMatrix?: boolean;
  active?: boolean;
  city?: string;
  state?: string;
  segment?: string;
  planId?: string;
  modules?: string[];
};

export type AccessContext = {
  storeId: string;
  role: string;
  fullAccess: boolean;
  accessAreas: string[];
  permissions: Record<string, unknown>;
  homeArea?: string | null;
  active?: boolean;
  areaLabels?: Record<string, string>;
};

export type DayPoint = {
  key: string;
  label: string;
  inflow: number;
  outflow: number;
  sales: number;
};

export type TechnicianRank = {
  name: string;
  closedCount: number;
  revenue: number;
  returns: number;
  inProgress: number;
  avgTicket: number;
};

export type DashboardSummary = {
  cashBalance: number;
  treasury: number;
  payablesOpen: number;
  receivablesOpen: number;
  advancesOpen: number;
  soldCount: number;
  revenuePeriod: number;
  expensePeriod: number;
  resultPeriod: number;
  openOs: number;
  lowStock: number;
  series: DayPoint[];
  mix: { label: string; value: number; tone: string }[];
  technicians: TechnicianRank[];
  topCloser: TechnicianRank | null;
  topEarner: TechnicianRank | null;
  topReturns: TechnicianRank | null;
  deliveredCount: number;
  returnRate: number;
  openPosTickets?: number;
  skuCount?: number;
  stockUnits?: number;
};

export type ApiErrorBody = {
  success: false;
  error: { code: string; message: string; details?: unknown };
};
