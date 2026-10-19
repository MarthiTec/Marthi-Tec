import { apiRequest } from './client';

export type AuditLogEntry = {
  id: string;
  action: string;
  entity: string;
  entityId?: string | null;
  userId?: string | null;
  createdAt: string;
  details: Record<string, unknown>;
};

type Auth = { token: string; storeId: string };

export async function listAuditLogs(
  opts: Auth & { action?: string; entity?: string; limit?: number },
): Promise<AuditLogEntry[]> {
  const params = new URLSearchParams();
  if (opts.action?.trim()) params.set('action', opts.action.trim());
  if (opts.entity?.trim()) params.set('entity', opts.entity.trim());
  if (opts.limit) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return apiRequest(`/audit-logs${qs ? `?${qs}` : ''}`, {
    token: opts.token,
    storeId: opts.storeId,
  });
}
