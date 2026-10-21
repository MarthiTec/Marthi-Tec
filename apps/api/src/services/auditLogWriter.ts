/**
 * Writer central da trilha operacional (audit_logs / MarthiDB).
 * Sem secrets/PII sensível no summary; details são limpos na leitura.
 */
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

export type AuditActionType = 'inclusao' | 'alteracao' | 'exclusao' | 'conclusao';

export type AuditModuleKey =
  | 'produtos_estoque'
  | 'entrada'
  | 'movimentos'
  | 'vendas'
  | 'pdv'
  | 'clientes'
  | 'pessoas'
  | 'financeiro'
  | 'catalogo_digital'
  | 'cotacoes'
  | 'acessos'
  | 'sistema';

export const AUDIT_MODULE_LABELS: Record<AuditModuleKey, string> = {
  produtos_estoque: 'Produtos & Estoque',
  entrada: 'Entrada de estoque',
  movimentos: 'Movimentos',
  vendas: 'Venda externa',
  pdv: 'PDV / Caixa',
  clientes: 'Clientes',
  pessoas: 'Pessoas',
  financeiro: 'Financeiro',
  catalogo_digital: 'Catálogo digital',
  cotacoes: 'Cotações / Orçamentos',
  acessos: 'Acessos',
  sistema: 'Sistema',
};

export const AUDIT_ACTION_TYPE_LABELS: Record<AuditActionType, string> = {
  inclusao: 'Inclusão',
  alteracao: 'Alteração',
  exclusao: 'Exclusão',
  conclusao: 'Conclusão',
};

const SECRET_KEY =
  /password|passwd|secret|token|authorization|apikey|api_key|credential|smtp|jwt|hash|salt|connection.?string|database_url/i;
/** PII fields that must not be dumped in free-form details (actor* keys are allowlisted). */
const PII_KEY = /^(cpf|cnpj|document|phone|email|customerDocument|customerPhone)$/i;
const SAFE_META_KEY = /^(summary|actorName|actorEmail|moduleLabel|actionTypeLabel|menuLabel|kind|path|module|actionType)$/i;

function scrubDetails(value: unknown, depth = 0): unknown {
  if (value == null || depth > 4) return value;
  if (typeof value === 'string') {
    if (value.length > 400) return `${value.slice(0, 120)}…`;
    return value;
  }
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => scrubDetails(item, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (SAFE_META_KEY.test(key)) {
        out[key] = typeof child === 'string' && child.length > 400 ? `${child.slice(0, 120)}…` : child;
        continue;
      }
      if (SECRET_KEY.test(key) || PII_KEY.test(key)) {
        out[key] = '[redacted]';
        continue;
      }
      out[key] = scrubDetails(child, depth + 1);
    }
    return out;
  }
  return value;
}

export type WriteAuditInput = {
  storeId: string;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  actionType: AuditActionType;
  module: AuditModuleKey;
  /** Rótulo de menu/rota em PT; default = label do módulo. */
  menuLabel?: string;
  summary?: string;
  details?: Record<string, unknown>;
  ip?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
};

export async function writeAuditLog(
  db: Pool | PoolClient,
  input: WriteAuditInput,
): Promise<string> {
  const id = `AUD-${randomUUID()}`;
  const menuLabel = (input.menuLabel || AUDIT_MODULE_LABELS[input.module] || input.module).trim();
  const details = scrubDetails({
    ...(input.details ?? {}),
    summary: input.summary?.trim() || undefined,
    actorName: input.actorName || undefined,
    actorEmail: input.actorEmail || undefined,
    moduleLabel: AUDIT_MODULE_LABELS[input.module],
    actionTypeLabel: AUDIT_ACTION_TYPE_LABELS[input.actionType],
    menuLabel,
  }) as Record<string, unknown>;

  await db.query(
    `INSERT INTO audit_logs (
       id, store_id, user_id, action, entity, entity_id, details, ip,
       module, menu_label, action_type
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)`,
    [
      id,
      input.storeId,
      input.userId ?? null,
      input.action.trim(),
      input.entity.trim(),
      input.entityId ?? null,
      JSON.stringify(details),
      input.ip ?? null,
      input.module,
      menuLabel,
      input.actionType,
    ],
  );
  return id;
}

/** Não deixa falha de auditoria derrubar a operação de negócio. */
export async function writeAuditLogSafe(
  db: Pool | PoolClient | null | undefined,
  input: WriteAuditInput,
): Promise<string | null> {
  if (!db) return null;
  try {
    return await writeAuditLog(db, input);
  } catch (err) {
    console.warn('[auditLogWriter] falha ao gravar auditoria:', (err as Error)?.message || err);
    return null;
  }
}

export function mapAuditRow(row: Record<string, unknown>) {
  const details =
    typeof row.details === 'string'
      ? (() => {
          try {
            return JSON.parse(row.details);
          } catch {
            return {};
          }
        })()
      : ((row.details as Record<string, unknown>) ?? {});
  const module = (row.module as string) || (details.module as string) || '';
  const actionType = (row.action_type as string) || (details.actionType as string) || '';
  const menuLabel =
    (row.menu_label as string) ||
    (details.menuLabel as string) ||
    (module && AUDIT_MODULE_LABELS[module as AuditModuleKey]) ||
    '';
  return {
    id: row.id as string,
    storeId: row.store_id as string | null,
    userId: row.user_id as string | null,
    action: row.action as string,
    entity: row.entity as string,
    entityId: (row.entity_id as string) ?? null,
    module: module || null,
    moduleLabel:
      (details.moduleLabel as string) ||
      (module ? AUDIT_MODULE_LABELS[module as AuditModuleKey] : null) ||
      module ||
      null,
    menuLabel: menuLabel || null,
    actionType: actionType || null,
    actionTypeLabel:
      (details.actionTypeLabel as string) ||
      (actionType ? AUDIT_ACTION_TYPE_LABELS[actionType as AuditActionType] : null) ||
      null,
    summary: (details.summary as string) || null,
    actorName: (details.actorName as string) || null,
    actorEmail: (details.actorEmail as string) || null,
    details: scrubDetails(details),
    createdAt: row.created_at,
  };
}
