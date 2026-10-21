import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminPicker } from '../AdminPicker';
import {
  AGING_BUCKETS,
  buildAgingSide,
  type AgingBucketId,
  type AgingSide,
} from '../../data/financeAging';
import { money, type Payable, type Receivable } from '../../data/financeBook';

type SideFilter = 'both' | 'ar' | 'ap';

function mapReceivable(item: Receivable) {
  return {
    id: item.id,
    description: item.description,
    partyName: item.customerName || 'Cliente',
    dueDate: item.dueDate,
    amount: item.amount,
    settledAmount: item.receivedAmount,
    status: item.status,
  };
}

function mapPayable(item: Payable) {
  return {
    id: item.id,
    description: item.description,
    partyName: item.supplierName || 'Fornecedor',
    dueDate: item.dueDate,
    amount: item.amount,
    settledAmount: item.paidAmount,
    status: item.status,
  };
}

function SideBlock({
  title,
  subtitle,
  side,
  emptyHint,
  goLabel,
  onGo,
  bucketFilter,
}: {
  title: string;
  subtitle: string;
  side: AgingSide;
  emptyHint: string;
  goLabel: string;
  onGo: () => void;
  bucketFilter: AgingBucketId | 'all';
}) {
  const buckets =
    bucketFilter === 'all' ? side.buckets : side.buckets.filter((bucket) => bucket.id === bucketFilter);
  const visibleRows = buckets.flatMap((bucket) =>
    bucket.rows.map((row) => ({ ...row, bucketLabel: AGING_BUCKETS.find((b) => b.id === row.bucket)?.label ?? row.bucket })),
  );
  const visibleTotal = buckets.reduce((sum, bucket) => sum + bucket.total, 0);

  if (side.count === 0) {
    return (
      <article className="admin-card aging-panel__empty">
        <h2>{title}</h2>
        <p className="empty" role="status" style={{ margin: '12px 0' }}>
          {emptyHint}
        </p>
        <button type="button" className="btn btn--ghost" onClick={onGo}>
          {goLabel}
        </button>
      </article>
    );
  }

  return (
    <article className="admin-card">
      <div className="admin-toolbar" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <p className="empty" style={{ margin: '4px 0 0' }}>
            {subtitle} · em aberto {money(visibleTotal)}
            {bucketFilter !== 'all' ? ` no bucket selecionado` : ` · ${side.count} título(s)`}
          </p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={onGo}>
          {goLabel}
        </button>
      </div>

      <div className="aging-panel__buckets" aria-label={`Faixas de ${title}`}>
        {side.buckets.map((bucket) => (
          <div
            key={bucket.id}
            className={`aging-panel__bucket${bucket.total > 0 && bucket.id !== 'current' ? ' is-overdue' : ''}`}
          >
            <span className="aging-panel__bucket-label">{bucket.label}</span>
            <strong>{money(bucket.total)}</strong>
            <small>
              {bucket.count === 0 ? 'Sem títulos' : `${bucket.count} título(s)`}
            </small>
          </div>
        ))}
      </div>

      {visibleRows.length === 0 ? (
        <p className="empty" role="status" style={{ marginTop: 16 }}>
          Nenhum título nesta faixa.
        </p>
      ) : (
        <div className="admin-table-container" style={{ marginTop: 16 }}>
          <table className="admin-table" style={{ width: '100%', fontSize: '0.88rem' }}>
            <thead>
              <tr>
                <th>Vencimento</th>
                <th>Descrição</th>
                <th>Parte</th>
                <th>Faixa</th>
                <th style={{ textAlign: 'right' }}>Em aberto</th>
                <th style={{ textAlign: 'right' }}>Dias</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(`${row.dueDate.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR')}</td>
                  <td>{row.description}</td>
                  <td>{row.partyName}</td>
                  <td>{row.bucketLabel}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{money(row.openAmount)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {row.daysPastDue <= 0 ? '—' : row.daysPastDue}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

export function AgingPanel({
  receivables,
  payables,
  onGoReceber,
  onGoPagar,
}: {
  receivables: Receivable[];
  payables: Payable[];
  onGoReceber: () => void;
  onGoPagar: () => void;
}) {
  const [side, setSide] = useState<SideFilter>('both');
  const [bucketFilter, setBucketFilter] = useState<AgingBucketId | 'all'>('all');
  const asOf = useMemo(() => new Date(), []);

  const ar = useMemo(
    () => buildAgingSide(receivables.map(mapReceivable), asOf),
    [receivables, asOf],
  );
  const ap = useMemo(() => buildAgingSide(payables.map(mapPayable), asOf), [payables, asOf]);

  const nothingOpen = ar.count === 0 && ap.count === 0;

  return (
    <div className="aging-panel">
      <div className="admin-toolbar" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ flex: '1 1 220px' }}>
          <p className="empty" style={{ margin: 0 }}>
            Aging calculado pela <strong>data de vencimento</strong> dos títulos em aberto/parcial.
            Valores são saldo a receber / a pagar — não confundir com receita de vendas nem com
            entradas do livro (DRE).
          </p>
          <p className="empty" style={{ margin: '6px 0 0', fontSize: '0.8rem' }}>
            Referência: {asOf.toLocaleDateString('pt-BR')} ·{' '}
            <Link to="/painel/relatorios">Central de Relatórios</Link>
          </p>
        </div>
        <div style={{ minWidth: 160 }}>
          <AdminPicker
            compact
            label="Lado"
            value={side}
            options={[
              { value: 'both', label: 'A receber + a pagar' },
              { value: 'ar', label: 'Só a receber' },
              { value: 'ap', label: 'Só a pagar' },
            ]}
            onChange={(value) => setSide(value as SideFilter)}
          />
        </div>
        <div style={{ minWidth: 160 }}>
          <AdminPicker
            compact
            label="Faixa"
            value={bucketFilter}
            options={[
              { value: 'all', label: 'Todas as faixas' },
              ...AGING_BUCKETS.map((bucket) => ({ value: bucket.id, label: bucket.label })),
            ]}
            onChange={(value) => setBucketFilter(value as AgingBucketId | 'all')}
          />
        </div>
      </div>

      {nothingOpen ? (
        <article className="admin-card aging-panel__empty aging-panel__empty--hero" role="status">
          <h2 style={{ marginTop: 0 }}>Nenhum título em aberto</h2>
          <p className="empty">
            Não há contas a receber nem a pagar com saldo em aberto nesta loja. O aging fica vazio —
            sem faixas inventadas.
          </p>
          <div className="admin-toolbar" style={{ marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
            <button type="button" className="btn btn--primary" onClick={onGoReceber}>
              Ir para A receber
            </button>
            <button type="button" className="btn btn--ghost" onClick={onGoPagar}>
              Ir para A pagar
            </button>
          </div>
        </article>
      ) : (
        <div className="aging-panel__sides">
          {side !== 'ap' ? (
            <SideBlock
              title="A receber (AR)"
              subtitle="Saldo a receber por vencimento"
              side={ar}
              emptyHint="Nenhuma conta a receber em aberto. Sem números fictícios."
              goLabel="Abrir A receber"
              onGo={onGoReceber}
              bucketFilter={bucketFilter}
            />
          ) : null}
          {side !== 'ar' ? (
            <SideBlock
              title="A pagar (AP)"
              subtitle="Saldo a pagar por vencimento"
              side={ap}
              emptyHint="Nenhuma conta a pagar em aberto. Sem números fictícios."
              goLabel="Abrir A pagar"
              onGo={onGoPagar}
              bucketFilter={bucketFilter}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
