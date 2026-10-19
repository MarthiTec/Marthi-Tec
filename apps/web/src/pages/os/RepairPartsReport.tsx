import { useEffect, useState, type ReactNode } from 'react';
import { apiPartsReport, type PartsReport } from '../../services/repairPartsApi';
import { repairMoney } from '../../services/repairsApi';

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 8)}01`;
const br = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');

function downloadCsv(name: string, rows: Array<Array<string | number>>) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

/** Relatório das peças de manutenção: estoque, o que repor, consumo nas OS, compras e encomendas. */
export function RepairPartsReport() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [report, setReport] = useState<PartsReport | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setReport(null);
    apiPartsReport(from, to)
      .then((data) => (setReport(data), setError('')))
      .catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível gerar o relatório.'));
  }, [from, to]);

  function exportCsv() {
    if (!report) return;
    downloadCsv(`pecas-manutencao-${report.from}-a-${report.to}.csv`, [
      ['Relatório de peças de manutenção', `${br(report.from)} a ${br(report.to)}`],
      [],
      ['Estoque', 'Peças', report.stock.parts, 'Unidades', report.stock.units, 'Valor (custo)', report.stock.value.toFixed(2).replace('.', ',')],
      [],
      ['Repor (no mínimo ou abaixo)'],
      ['Peça', 'Código', 'Saldo', 'Mínimo', 'Falta', 'Custo'],
      ...report.stock.low.map((p) => [p.name, p.sku, p.qty, p.minQty, p.missing, p.cost.toFixed(2).replace('.', ',')]),
      [],
      ['Consumo nas OS'],
      ['Peça', 'Código', 'Quantidade', 'OS', 'Custo'],
      ...report.usage.map((p) => [p.name, p.sku, p.qty, p.orders, p.cost.toFixed(2).replace('.', ',')]),
      [],
      ['Compras (entradas)'],
      ['Peça', 'Código', 'Quantidade', 'Custo'],
      ...report.entries.map((p) => [p.name, p.sku, p.qty, p.cost.toFixed(2).replace('.', ',')]),
      [],
      ['Encomendas aguardando'],
      ['Peça', 'Qtd', 'Fornecedor', 'Previsão', 'OS', 'Cliente', 'Situação'],
      ...report.orders.list.map((o) => [o.partName, o.qty, o.supplierName, br(o.expectedAt), o.workOrderId ?? '', o.customerName, o.late ? 'Atrasada' : 'Encomendada']),
    ]);
  }

  const usageCost = report?.usage.reduce((sum, row) => sum + row.cost, 0) ?? 0;
  const entriesCost = report?.entries.reduce((sum, row) => sum + row.cost, 0) ?? 0;

  return (
    <div className="parts-report">
      <div className="repair-parts__tools parts-report__tools">
        <label>
          De
          <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        </label>
        <label>
          Até
          <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </label>
        <div className="parts-report__actions">
          <button type="button" className="btn btn--ghost" disabled={!report} onClick={exportCsv}>
            Exportar planilha
          </button>
          <button type="button" className="btn btn--ghost" disabled={!report} onClick={() => window.print()}>
            Imprimir
          </button>
        </div>
      </div>
      {error ? <p className="qty-low">{error}</p> : null}
      {!report && !error ? <p className="repairs__muted">Gerando relatório…</p> : null}
      {report ? (
        <>
          <div className="repair-parts__stats">
            <div className="repair-parts__stat" style={{ cursor: 'default' }}>
              <span>Em estoque (custo)</span>
              <strong>{repairMoney(report.stock.value)}</strong>
              <small>{report.stock.units} un. em {report.stock.parts} peças</small>
            </div>
            <div className="repair-parts__stat repair-parts__stat--low" style={{ cursor: 'default' }}>
              <span>Para repor</span>
              <strong>{report.stock.low.length}</strong>
              <small>no mínimo ou sem estoque</small>
            </div>
            <div className="repair-parts__stat" style={{ cursor: 'default' }}>
              <span>Usado nas OS</span>
              <strong>{repairMoney(usageCost)}</strong>
              <small>{report.usage.reduce((sum, row) => sum + row.qty, 0)} un. no período</small>
            </div>
            <div className={`repair-parts__stat${report.orders.late ? ' repair-parts__stat--out' : ''}`} style={{ cursor: 'default' }}>
              <span>Encomendas</span>
              <strong>{report.orders.pending}</strong>
              <small>{report.orders.late ? `${report.orders.late} atrasada(s)` : 'nenhuma atrasada'}</small>
            </div>
          </div>

          <ReportTable title="Repor (no mínimo ou sem estoque)" empty="Nenhuma peça abaixo do mínimo." head={['Peça', 'Saldo', 'Mínimo', 'Falta', 'Custo un.']}>
            {report.stock.low.map((p) => (
              <tr key={p.id}>
                <td data-label="Peça">
                  <strong>{p.name}</strong> <small className="repairs__muted">{p.sku}</small>
                </td>
                <td data-label="Saldo">{p.qty}</td>
                <td data-label="Mínimo">{p.minQty}</td>
                <td data-label="Falta">
                  <b>{p.missing}</b>
                </td>
                <td data-label="Custo un.">{repairMoney(p.cost)}</td>
              </tr>
            ))}
          </ReportTable>

          <ReportTable title={`Consumo nas OS · ${br(report.from)} a ${br(report.to)}`} empty="Nenhuma peça usada nas OS no período." head={['Peça', 'Quantidade', 'OS', 'Custo']}>
            {report.usage.map((p) => (
              <tr key={p.id}>
                <td data-label="Peça">
                  <strong>{p.name}</strong> <small className="repairs__muted">{p.sku}</small>
                </td>
                <td data-label="Quantidade">{p.qty}</td>
                <td data-label="OS">{p.orders}</td>
                <td data-label="Custo">{repairMoney(p.cost)}</td>
              </tr>
            ))}
          </ReportTable>

          <ReportTable title={`Compras (entradas) · ${repairMoney(entriesCost)}`} empty="Nenhuma entrada de peças no período." head={['Peça', 'Quantidade', 'Custo']}>
            {report.entries.map((p) => (
              <tr key={p.id}>
                <td data-label="Peça">
                  <strong>{p.name}</strong> <small className="repairs__muted">{p.sku}</small>
                </td>
                <td data-label="Quantidade">{p.qty}</td>
                <td data-label="Custo">{repairMoney(p.cost)}</td>
              </tr>
            ))}
          </ReportTable>

          <ReportTable title="Encomendas aguardando" empty="Nenhuma peça aguardando chegar." head={['Peça', 'Fornecedor', 'Previsão', 'OS / cliente']}>
            {report.orders.list.map((o) => (
              <tr key={o.id}>
                <td data-label="Peça">
                  <strong>
                    {o.qty}× {o.partName}
                  </strong>
                </td>
                <td data-label="Fornecedor">{o.supplierName || '—'}</td>
                <td data-label="Previsão">
                  {br(o.expectedAt)} {o.late ? <span className="repair-parts__badge repair-parts__badge--out">Atrasada</span> : null}
                </td>
                <td data-label="OS / cliente">{o.workOrderId ? `${o.workOrderId}${o.customerName ? ` · ${o.customerName}` : ''}` : 'Reposição'}</td>
              </tr>
            ))}
          </ReportTable>
        </>
      ) : null}
    </div>
  );
}

function ReportTable({ title, empty, head, children }: { title: string; empty: string; head: string[]; children: ReactNode[] }) {
  return (
    <section className="parts-report__section">
      <h3>{title}</h3>
      {children.length ? (
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                {head.map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>{children}</tbody>
          </table>
        </div>
      ) : (
        <p className="repairs__muted">{empty}</p>
      )}
    </section>
  );
}
