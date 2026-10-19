import { apiRequest } from './client';
import type { AccessContext, AuthSession, AuthUser, DashboardSummary, StoreRow } from './types';

export async function loginWithPassword(email: string, password: string): Promise<AuthSession> {
  return apiRequest<AuthSession>('/auth/login', {
    method: 'POST',
    body: { email: email.trim(), password },
  });
}

export async function fetchCurrentUser(token: string): Promise<AuthUser> {
  const data = await apiRequest<{ user: AuthUser }>('/auth/me', { token });
  return data.user;
}

export async function fetchAccess(token: string, storeId: string): Promise<AccessContext> {
  return apiRequest<AccessContext>('/auth/access', { token, storeId });
}

export async function fetchStores(token: string, storeId?: string | null): Promise<StoreRow[]> {
  return apiRequest<StoreRow[]>('/stores', {
    token,
    // Lista de lojas da conta: header vazio evita filtro por loja sem membership.
    storeId: storeId ?? '',
  });
}

export async function fetchDashboardSummary(
  token: string,
  storeId: string,
  days: number,
): Promise<DashboardSummary> {
  return apiRequest<DashboardSummary>(`/dashboard/summary?days=${days}`, { token, storeId });
}
