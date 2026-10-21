/**
 * Aging AR/AP — buckets calculados a partir de due_date e saldo em aberto.
 * Sem colunas novas no banco; faixas só existem quando há títulos reais.
 */

export type AgingBucketId = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus';

export const AGING_BUCKETS: Array<{ id: AgingBucketId; label: string; hint: string }> = [
  { id: 'current', label: 'A vencer', hint: 'Vencimento futuro ou hoje' },
  { id: 'd1_30', label: '1–30 dias', hint: 'Vencidos há até 30 dias' },
  { id: 'd31_60', label: '31–60 dias', hint: 'Vencidos há 31 a 60 dias' },
  { id: 'd61_90', label: '61–90 dias', hint: 'Vencidos há 61 a 90 dias' },
  { id: 'd90_plus', label: 'Acima de 90', hint: 'Vencidos há mais de 90 dias' },
];

export type AgingBillInput = {
  id: string;
  description: string;
  partyName: string;
  dueDate: string;
  amount: number;
  settledAmount: number;
  status: string;
};

export type AgingRow = AgingBillInput & {
  openAmount: number;
  daysPastDue: number;
  bucket: AgingBucketId;
};

export type AgingBucketSummary = {
  id: AgingBucketId;
  label: string;
  hint: string;
  total: number;
  count: number;
  rows: AgingRow[];
};

export type AgingSide = {
  total: number;
  count: number;
  buckets: AgingBucketSummary[];
};

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

/** Interpreta YYYY-MM-DD (ou ISO) em data local sem deslocar fuso. */
export function parseDueDateLocal(dueDate: string): Date | null {
  const raw = String(dueDate || '').trim();
  if (!raw) return null;
  const day = raw.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) {
    const fallback = new Date(raw);
    return Number.isNaN(fallback.getTime()) ? null : startOfLocalDay(fallback);
  }
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  return new Date(y, m - 1, d);
}

/** Dias além do vencimento; ≤0 = a vencer / vence hoje. */
export function daysPastDue(dueDate: string, asOf: Date = new Date()): number | null {
  const due = parseDueDateLocal(dueDate);
  if (!due) return null;
  const today = startOfLocalDay(asOf);
  const ms = today.getTime() - due.getTime();
  return Math.floor(ms / 86_400_000);
}

export function bucketForDaysPastDue(days: number): AgingBucketId {
  if (days <= 0) return 'current';
  if (days <= 30) return 'd1_30';
  if (days <= 60) return 'd31_60';
  if (days <= 90) return 'd61_90';
  return 'd90_plus';
}

function emptyBuckets(): AgingBucketSummary[] {
  return AGING_BUCKETS.map((bucket) => ({
    ...bucket,
    total: 0,
    count: 0,
    rows: [],
  }));
}

/** Só títulos open/partial com saldo > 0; buckets derivados de due_date real. */
export function buildAgingSide(items: AgingBillInput[], asOf: Date = new Date()): AgingSide {
  const buckets = emptyBuckets();
  const byId = new Map(buckets.map((bucket) => [bucket.id, bucket]));
  let total = 0;
  let count = 0;

  for (const item of items) {
    if (item.status !== 'open' && item.status !== 'partial') continue;
    const openAmount = Math.max(0, Number(item.amount) - Number(item.settledAmount));
    if (openAmount <= 0) continue;
    const days = daysPastDue(item.dueDate, asOf);
    if (days === null) continue;
    const bucketId = bucketForDaysPastDue(days);
    const bucket = byId.get(bucketId);
    if (!bucket) continue;
    const row: AgingRow = {
      ...item,
      openAmount,
      daysPastDue: days,
      bucket: bucketId,
    };
    bucket.rows.push(row);
    bucket.total += openAmount;
    bucket.count += 1;
    total += openAmount;
    count += 1;
  }

  for (const bucket of buckets) {
    bucket.rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || b.openAmount - a.openAmount);
  }

  return { total, count, buckets };
}
