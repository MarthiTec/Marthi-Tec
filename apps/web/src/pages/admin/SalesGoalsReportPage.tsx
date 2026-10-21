import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import './goalsPages.css';
import { getActiveStore } from '../../data/multiStoreStore';
import { AdminPicker } from '../../components/AdminPicker';
import {
  apiExportSalesGoalsReport,
  apiGetSalesGoalsReport,
  apiListCustomers,
  apiListGoals,
  apiListSellers,
  type GoalRow,
} from '../../services/erpApi';
import { jsPDF } from 'jspdf';
import { ReportShareActions } from '../../components/ReportShareActions';
import { downloadBlob } from '../../utils/commercialPdf';

function monthBounds() {
  const d = new Date();
  return {
    start: new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10),
    end: new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10),
  };
}

export function SalesGoalsReportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const defaults = useMemo(() => monthBounds(), []);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loadError, setLoadError] = useState('');
  const [exportError, setExportError] = useState('');

  // Deep-link: ?startDate=&endDate= (hub / atalhos)
  const [startDate, setStartDate] = useState(() => searchParams.get('startDate') || defaults.start);
  const [endDate, setEndDate] = useState(() => searchParams.get('endDate') || defaults.end);
  // Filtro pelo id do vendedor cadastrado (antes ia o nome e o filtro nunca encontrava vendas).
  const [sellerName, setSellerName] = useState('all');
  const [sellerOptions, setSellerOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [paymentMethod, setPaymentMethod] = useState('all');
  const [saleType, setSaleType] = useState('all');
  const [customerId, setCustomerId] = useState('all');
  const [goalId, setGoalId] = useState('all');

  const [customers, setCustomers] = useState<any[]>([]);
  const [goals, setGoals] = useState<GoalRow[]>([]);

  const reportFilters = useMemo(
    () => ({
      startDate,
      endDate,
      sellerId: sellerName !== 'all' ? sellerName : undefined,
      paymentMethod: paymentMethod !== 'all' ? paymentMethod : undefined,
      saleType: saleType !== 'all' ? saleType : undefined,
      customerId: customerId !== 'all' ? customerId : undefined,
      goalId: goalId !== 'all' ? goalId : undefined,
    }),
    [startDate, endDate, sellerName, paymentMethod, saleType, customerId, goalId],
  );

  const filtersActive =
    sellerName !== 'all' ||
    paymentMethod !== 'all' ||
    saleType !== 'all' ||
    customerId !== 'all' ||
    goalId !== 'all' ||
    startDate !== defaults.start ||
    endDate !== defaults.end;

  useEffect(() => {
    apiListCustomers().then((c) => setCustomers(Array.isArray(c) ? c : [])).catch(() => {});
    apiListGoals().then((g) => setGoals(Array.isArray(g) ? g : [])).catch(() => {});
    apiListSellers()
      .then((list) => setSellerOptions(list.map((item) => ({ id: item.id, name: item.name })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))))
      .catch(() => setSellerOptions([]));
  }, []);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (startDate) next.set('startDate', startDate);
    else next.delete('startDate');
    if (endDate) next.set('endDate', endDate);
    else next.delete('endDate');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only sync dates into URL
  }, [startDate, endDate]);

  async function fetchReport() {
    setLoading(true);
    setLoadError('');
    try {
      const res = await apiGetSalesGoalsReport(reportFilters);
      // O cliente da API já devolve o conteúdo de "data" (antes lia res.data e o relatório ficava sempre vazio).
      setData(res && typeof res === 'object' && 'summary' in res ? res : (res as any)?.data ?? null);
    } catch (err) {
      // Mostra o motivo em vez de "nenhuma venda" (ex.: sistema reiniciando).
      setData(null);
      setLoadError(err instanceof Error ? err.message : 'Não foi possível carregar o relatório. Tente de novo.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchReport();
  }, [reportFilters]);

  function clearFilters() {
    setStartDate(defaults.start);
    setEndDate(defaults.end);
    setSellerName('all');
    setPaymentMethod('all');
    setSaleType('all');
    setCustomerId('all');
    setGoalId('all');
  }

  async function handleExportExcel() {
    setExporting(true);
    setExportError('');
    try {
      const blob = await apiExportSalesGoalsReport(reportFilters);
      downloadBlob(blob, `Relatorio_Vendas_Metas_${startDate}_${endDate}.xlsx`);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Não foi possível exportar o Excel.');
    } finally {
      setExporting(false);
    }
  }

  function handleExportPdf() {
    if (!data) return;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const canViewProfit = data.canViewProfit;

    doc.setFontSize(16);
    doc.text(`${getActiveStore()?.tradeName || 'Loja'} — Relatório de Vendas e Metas`, 14, 16);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(
      `Período: ${new Date(startDate).toLocaleDateString('pt-BR')} até ${new Date(endDate).toLocaleDateString('pt-BR')} · Emissão: ${new Date().toLocaleString('pt-BR')}`,
      14,
      23,
    );

    // Resumo Gerencial
    const s = data.summary;
    let y = 32;
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text('RESUMO DO PERÍODO:', 14, y);
    y += 6;
    doc.setFontSize(9);

    const summaryLine1 = [
      `Receita de vendas: R$ ${s.totalSales?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      canViewProfit ? `Total de Custo: R$ ${s.totalCost?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : null,
      canViewProfit ? `Lucro Bruto: R$ ${s.grossProfit?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : null,
      canViewProfit ? `Margem Média: ${s.marginPercent}%` : null,
      `Vendas concluídas: ${s.salesCount}`,
      `Ticket Médio: R$ ${s.averageTicket?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    ].filter((name): name is string => Boolean(name)).join('   |   ');
    doc.text(summaryLine1, 14, y);

    if (s.goalTarget) {
      y += 6;
      const summaryLine2 = [
        `Meta: R$ ${s.goalTarget?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        `Realizado: R$ ${s.goalRealized?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        `Atingimento: ${s.goalPercent}%`,
        `Falta: ${s.goalRemaining > 0 ? `R$ ${s.goalRemaining.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Meta Atingida!'}`,
        `Comissão Calculada: R$ ${s.commissionAmount?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      ].join('   |   ');
      doc.text(summaryLine2, 14, y);
      if (goal) {
        y += 6;
        doc.text(`Meta "${goal.name}" · ${goal.sellerName} · ${goalPeriod}${goal.isReached ? ' · batida' : ' · em andamento'}`, 14, y);
      }
    }

    y += 10;
    doc.setLineWidth(0.3);
    doc.line(14, y, 283, y);
    y += 6;

    // Cabeçalho da Tabela
    doc.setFont('helvetica', 'bold');
    doc.text('Data', 14, y);
    doc.text('Nº Venda', 34, y);
    doc.text('Cliente', 66, y);
    doc.text('Produtos', 110, y);
    doc.text('Pagamento', 175, y);
    doc.text('Total (R$)', 210, y);
    if (canViewProfit) {
      doc.text('Custo (R$)', 235, y);
      doc.text('Lucro (R$)', 258, y);
      doc.text('Margem', 276, y);
    }
    doc.setFont('helvetica', 'normal');

    y += 4;
    doc.line(14, y, 283, y);
    y += 5;

    // Linhas
    for (const r of data.rows) {
      if (y > 185) {
        doc.addPage();
        y = 20;
      }
      doc.text(new Date(r.date).toLocaleDateString('pt-BR'), 14, y);
      doc.text(r.id.slice(0, 14), 34, y);
      doc.text(r.customerName.slice(0, 22), 66, y);
      doc.text(r.productNames.slice(0, 32), 110, y);
      doc.text(r.paymentMethod.slice(0, 16), 175, y);
      doc.text(r.netAmount?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), 210, y);
      if (canViewProfit) {
        doc.text(r.costTotal?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00', 235, y);
        doc.text(r.grossProfit?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00', 258, y);
        doc.text(`${r.marginPercent}%`, 276, y);
      }
      y += 6;
    }

    doc.save(`Relatorio_Vendas_Metas_${startDate}_${endDate}.pdf`);
  }

  const s = data?.summary;
  const canViewProfit = data?.canViewProfit;
  const goal = data?.goal as
    | null
    | { name: string; targetValue: number; realized: number; percent: number; remaining: number; salesCount: number; goalType: string; startDate: string; endDate: string | null; openEnded?: boolean; reachedAt?: string | null; isReached: boolean; sellerName: string; currentTierName?: string; commissionAmount: number | null };
  const brl = (value: number) => (Number(value) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const goalValue = (value: number) => (goal?.goalType === 'sales_count' ? `${Math.round(value)} vendas` : brl(value));
  const day = (value?: string | null) => (value ? new Date(String(value).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '');
  const goalPeriod = goal
    ? goal.endDate
      ? `${day(goal.startDate)} até ${day(goal.endDate)}`
      : `Desde ${day(goal.startDate)} · ${goal.reachedAt ? `batida em ${new Date(goal.reachedAt).toLocaleDateString('pt-BR')}` : 'até bater a meta'}`
    : '';
  const shareLines = [
    `Período: ${day(startDate)}${endDate ? ` até ${day(endDate)}` : ' até hoje'}`,
    s ? `Vendas concluídas: ${s.salesCount} · Receita de vendas: ${brl(s.totalSales)}` : '',
    goal ? `Meta "${goal.name}" (${goal.sellerName}): ${goalValue(goal.realized)} de ${goalValue(goal.targetValue)} (${goal.percent}%) · ${goalPeriod}` : '',
    goal && !goal.isReached ? `Faltam ${goalValue(goal.remaining)}` : goal ? 'Meta batida ✅' : '',
    ...((data?.rows ?? []) as any[]).slice(0, 40).map((row) => `• ${new Date(row.date).toLocaleDateString('pt-BR')} · ${row.customerName} · ${row.sellerName} · ${brl(row.netAmount)}`),
  ].filter(Boolean);

  const emptyRows = !loading && !loadError && (!data?.rows || data.rows.length === 0);

  return (
    <div className="admin-page goals-page" style={{ padding: '16px 20px', maxWidth: '1280px', margin: '0 auto' }}>
      {/* Cabeçalho */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: 'var(--ink)' }}>
              Relatório de Vendas & Metas
            </h1>
            <span className="admin-badge admin-badge--active" style={{ fontSize: '0.75rem' }}>
              {getActiveStore()?.tradeName || 'Loja atual'}
            </span>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--mute)' }}>
            Receita de vendas concluídas (não confundir com recebido no caixa/AR). Lucro só com permissão.
          </p>
          <p style={{ margin: '6px 0 0 0', fontSize: '0.8rem' }}>
            <Link to="/painel/relatorios" style={{ color: 'var(--accent)' }}>
              ← Central de Relatórios
            </Link>
            {' · '}
            <Link to={`/erp/financeiro?tab=dre`} style={{ color: 'var(--accent)' }}>
              DRE
            </Link>
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <ReportShareActions title="Relatório de Vendas & Metas" lines={shareLines} disabled={!data || emptyRows} onPrint={handleExportPdf} />
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={() => void handleExportExcel()}
            disabled={exporting || emptyRows}
          >
            {exporting ? 'Exportando…' : 'Exportar Excel (XLSX)'}
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={handleExportPdf}
            disabled={emptyRows}
          >
            Gerar PDF Executivo
          </button>
        </div>
      </div>

      {exportError ? (
        <p role="alert" className="qty-low" style={{ marginBottom: 12 }}>
          {exportError}
        </p>
      ) : null}

      {/* BARRA DE FILTROS COMPLETOS */}
      <div
        style={{
          background: 'var(--card, #171e27)',
          border: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
          borderRadius: '10px',
          padding: '16px',
          marginBottom: '20px',
        }}
      >
        <div className="goals-filters">
          <div>
            <label className="admin-label">Data Inicial</label>
            <input
              type="date"
              className="admin-input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div>
            <label className="admin-label">Data Final</label>
            <input
              type="date"
              className="admin-input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <div>
            <AdminPicker
              label="Vendedor"
              value={sellerName}
              options={[
                { value: 'all', label: 'Todos os Vendedores' },
                ...sellerOptions.map((seller) => ({ value: seller.id, label: seller.name })),
              ]}
              onChange={(val) => setSellerName(val)}
            />
          </div>

          <div>
            <AdminPicker
              label="Forma de Pagamento"
              value={paymentMethod}
              options={[
                { value: 'all', label: 'Todas as Formas' },
                { value: 'Cartão de Crédito', label: 'Cartão de Crédito' },
                { value: 'Cartão de Débito', label: 'Cartão de Débito' },
                { value: 'PIX', label: 'PIX' },
                { value: 'Dinheiro', label: 'Dinheiro em Espécie' },
              ]}
              onChange={(val) => setPaymentMethod(val)}
            />
          </div>

          <div>
            <AdminPicker
              label="Tipo de Venda"
              value={saleType}
              options={[
                { value: 'all', label: 'Todas (PDV + Externa)' },
                { value: 'external', label: 'Venda Externa (Sem Caixa)' },
                { value: 'pos', label: 'PDV Balcão' },
              ]}
              onChange={(val) => setSaleType(val)}
            />
          </div>

          <div>
            <AdminPicker
              label="Cliente"
              value={customerId}
              options={[
                { value: 'all', label: 'Todos os Clientes' },
                ...customers.map((c) => ({ value: c.id, label: c.name })),
              ]}
              onChange={(val) => setCustomerId(val)}
            />
          </div>

          <div>
            <AdminPicker
              label="Meta Vinculada"
              value={goalId}
              options={[
                { value: 'all', label: 'Meta Vigente do Período' },
                ...goals.map((g) => ({ value: g.id, label: g.name })),
              ]}
              onChange={(val) => setGoalId(val)}
            />
          </div>
        </div>
      </div>

      {loadError ? (
        <p role="alert" className="qty-low" style={{ marginBottom: 16 }}>
          {loadError}{' '}
          <button type="button" className="admin-btn admin-btn--secondary" onClick={() => void fetchReport()}>
            Tentar de novo
          </button>
        </p>
      ) : null}

      {/* Progresso da meta: aparece mesmo sem ter batido, para acompanhar, imprimir e enviar. */}
      {goal ? (
        <section className="goals-progress">
          <div className="goals-progress__head">
            <div>
              <span className="goals-progress__kicker">Progresso da meta</span>
              <h2>{goal.name} · {goal.sellerName}</h2>
              <small>{goalPeriod}</small>
            </div>
            <span className={`admin-badge${goal.isReached ? ' admin-badge--active' : ''}`}>
              {goal.isReached ? 'Meta batida' : 'Em andamento'}
              {goal.currentTierName ? ` · ${goal.currentTierName}` : ''}
            </span>
          </div>
          <div className="goals-progress__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, goal.percent)}>
            <span style={{ width: `${Math.min(100, Math.max(0, goal.percent))}%` }} />
          </div>
          <div className="goals-progress__numbers">
            <div><small>Realizado</small><strong>{goalValue(goal.realized)}</strong></div>
            <div><small>Meta</small><strong>{goalValue(goal.targetValue)}</strong></div>
            <div><small>Atingido</small><strong>{goal.percent}%</strong></div>
            <div><small>{goal.isReached ? 'Passou da meta' : 'Falta'}</small><strong>{goal.isReached ? goalValue(Math.max(0, goal.realized - goal.targetValue)) : goalValue(goal.remaining)}</strong></div>
            <div><small>Vendas na meta</small><strong>{goal.salesCount}</strong></div>
            {goal.commissionAmount !== null ? <div><small>Comissão</small><strong>{brl(goal.commissionAmount)}</strong></div> : null}
          </div>
        </section>
      ) : null}

      {/* CARDS DE RESUMO */}
      {s && (
        <div style={{ marginBottom: '24px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '12px',
              marginBottom: '14px',
            }}
          >
            <div
              style={{
                background: 'var(--card, #171e27)',
                border: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
                borderRadius: '8px',
                padding: '14px',
              }}
            >
              <span style={{ fontSize: '0.74rem', color: 'var(--mute)', textTransform: 'uppercase' }}>
                Receita de vendas
              </span>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--accent, #2dd4bf)', marginTop: '2px' }}>
                R$ {(s.totalSales || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <small style={{ color: 'var(--mute)' }}>Faturado no período · não é recebido</small>
            </div>

            {canViewProfit && (
              <>
                <div
                  style={{
                    background: 'var(--card, #171e27)',
                    border: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
                    borderRadius: '8px',
                    padding: '14px',
                  }}
                >
                  <span style={{ fontSize: '0.74rem', color: 'var(--mute)', textTransform: 'uppercase' }}>
                    Total de Custo
                  </span>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--goals-danger)', marginTop: '2px' }}>
                    R$ {(s.totalCost || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div
                  style={{
                    background: 'var(--card, #171e27)',
                    border: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
                    borderRadius: '8px',
                    padding: '14px',
                  }}
                >
                  <span style={{ fontSize: '0.74rem', color: 'var(--mute)', textTransform: 'uppercase' }}>
                    Lucro Bruto
                  </span>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--goals-success)', marginTop: '2px' }}>
                    R$ {(s.grossProfit || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div
                  style={{
                    background: 'var(--card, #171e27)',
                    border: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
                    borderRadius: '8px',
                    padding: '14px',
                  }}
                >
                  <span style={{ fontSize: '0.74rem', color: 'var(--mute)', textTransform: 'uppercase' }}>
                    Margem Média
                  </span>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--goals-success)', marginTop: '2px' }}>
                    {s.marginPercent}%
                  </div>
                </div>
              </>
            )}

            <div
              style={{
                background: 'var(--card, #171e27)',
                border: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
                borderRadius: '8px',
                padding: '14px',
              }}
            >
              <span style={{ fontSize: '0.74rem', color: 'var(--mute)', textTransform: 'uppercase' }}>
                Qtd Vendas
              </span>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--ink)', marginTop: '2px' }}>
                {s.salesCount || 0}
              </div>
            </div>

            <div
              style={{
                background: 'var(--card, #171e27)',
                border: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
                borderRadius: '8px',
                padding: '14px',
              }}
            >
              <span style={{ fontSize: '0.74rem', color: 'var(--mute)', textTransform: 'uppercase' }}>
                Ticket Médio
              </span>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--ink)', marginTop: '2px' }}>
                R$ {(s.averageTicket || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>

            {s.goalTarget && (
              <>
                <div
                  style={{
                    background: 'var(--card, #171e27)',
                    border: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
                    borderRadius: '8px',
                    padding: '14px',
                  }}
                >
                  <span style={{ fontSize: '0.74rem', color: 'var(--mute)', textTransform: 'uppercase' }}>
                    Meta / Atingimento
                  </span>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: s.goalPercent >= 100 ? 'var(--goals-success)' : 'var(--accent, #2dd4bf)', marginTop: '2px' }}>
                    {s.goalPercent}%
                  </div>
                  <small style={{ color: 'var(--mute)' }}>
                    Meta: R$ {s.goalTarget?.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                  </small>
                </div>

                <div
                  style={{
                    background: 'var(--card, #171e27)',
                    border: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
                    borderRadius: '8px',
                    padding: '14px',
                  }}
                >
                  <span style={{ fontSize: '0.74rem', color: 'var(--mute)', textTransform: 'uppercase' }}>
                    Comissão
                  </span>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--goals-warning)', marginTop: '2px' }}>
                    R$ {(s.commissionAmount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                  <small style={{ color: 'var(--mute)' }}>
                    {s.goalPercent >= 100 ? 'Meta atingida' : 'Aguardando a meta'}
                  </small>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Fechamento do período */}
      {s && (
        <div
          style={{
            background: 'var(--card-2, #1c2430)',
            border: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
            borderRadius: '10px',
            padding: '16px',
            marginBottom: '20px',
          }}
        >
          <h3 style={{ margin: '0 0 10px 0', fontSize: '0.96rem', fontWeight: 700, color: 'var(--ink)' }}>
            📋 Resumo de fechamento da equipe
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '12px',
              fontSize: '0.86rem',
            }}
          >
            <div>
              <span style={{ color: 'var(--mute)' }}>Receita de vendas:</span>{' '}
              <strong>R$ {s.totalSales?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
            </div>
            {canViewProfit && (
              <>
                <div>
                  <span style={{ color: 'var(--mute)' }}>Custo:</span>{' '}
                  <strong>R$ {s.totalCost?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--mute)' }}>Lucro bruto:</span>{' '}
                  <strong style={{ color: 'var(--goals-success)' }}>
                    R$ {s.grossProfit?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </strong>
                </div>
                <div>
                  <span style={{ color: 'var(--mute)' }}>Margem:</span>{' '}
                  <strong>{s.marginPercent}%</strong>
                </div>
              </>
            )}
            <div>
              <span style={{ color: 'var(--mute)' }}>Qtd. vendas concluídas:</span>{' '}
              <strong>{s.salesCount}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--mute)' }}>Ticket Médio:</span>{' '}
              <strong>R$ {s.averageTicket?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--mute)' }}>Meta Atingida:</span>{' '}
              <strong style={{ color: s.goalPercent >= 100 ? 'var(--goals-success)' : 'var(--goals-danger)' }}>
                {s.goalPercent >= 100 ? 'SIM' : 'NÃO'} ({s.goalPercent}%)
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* TABELA ANALÍTICA DE VENDAS */}
      <div
        style={{
          background: 'var(--card, #171e27)',
          border: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
          borderRadius: '10px',
          padding: '16px',
        }}
      >
        <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem', fontWeight: 700, color: 'var(--ink)' }}>
          Detalhamento de Vendas do Período
        </h3>

        {loading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--mute)' }}>Carregando dados...</div>
        ) : emptyRows ? (
          <div
            role="status"
            style={{
              padding: '28px 20px',
              textAlign: 'center',
              color: 'var(--mute)',
              background: 'var(--card-2, #1c2430)',
              borderRadius: 8,
            }}
          >
            <p style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 600, color: 'var(--ink)' }}>
              Nenhuma venda no período
            </p>
            <p style={{ margin: '0 0 16px', fontSize: '0.88rem' }}>
              Só entram vendas concluídas. Ajuste o período ou limpe os filtros — não inventamos números.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              {filtersActive ? (
                <button type="button" className="admin-btn admin-btn--secondary" onClick={clearFilters}>
                  Limpar filtros
                </button>
              ) : null}
              <Link to="/caixa" className="admin-btn admin-btn--primary">
                Ir ao Caixa
              </Link>
              <Link to="/painel/venda-externa" className="admin-btn admin-btn--secondary">
                Venda externa
              </Link>
              <Link to="/painel/relatorios" className="admin-btn admin-btn--secondary">
                Central de Relatórios
              </Link>
            </div>
          </div>
        ) : (
          <div className="admin-table-container">
            <table className="admin-table" style={{ width: '100%', fontSize: '0.86rem' }}>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Nº Venda</th>
                  <th>Produto(s)</th>
                  <th>Vendedor</th>
                  <th>Cliente</th>
                  <th>Forma Pgto</th>
                  <th style={{ textAlign: 'right' }}>Valor Venda</th>
                  {canViewProfit && (
                    <>
                      <th style={{ textAlign: 'right' }}>Custo</th>
                      <th style={{ textAlign: 'right' }}>Lucro</th>
                      <th style={{ textAlign: 'center' }}>Margem</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row: any) => (
                  <tr key={row.id}>
                    <td>{new Date(row.date).toLocaleDateString('pt-BR')}</td>
                    <td>
                      <strong style={{ color: 'var(--accent, #2dd4bf)' }}>#{row.id.slice(0, 12)}</strong>
                    </td>
                    <td>{row.productNames}</td>
                    <td>{row.sellerName}</td>
                    <td>{row.customerName}</td>
                    <td>{row.paymentMethod}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>
                      R$ {row.netAmount?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    {canViewProfit && (
                      <>
                        <td style={{ textAlign: 'right', color: 'var(--mute)' }}>
                          R$ {row.costTotal?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--goals-success)', fontWeight: 600 }}>
                          R$ {row.grossProfit?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="admin-badge admin-badge--active">{row.marginPercent}%</span>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
