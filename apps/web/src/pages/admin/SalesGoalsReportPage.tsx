import { useEffect, useState } from 'react';
import './goalsPages.css';
import { getActiveStore } from '../../data/multiStoreStore';
import { AdminPicker } from '../../components/AdminPicker';
import { apiGetSalesGoalsReport, apiListCustomers, apiListGoals, type GoalRow } from '../../services/erpApi';
import { jsPDF } from 'jspdf';

export function SalesGoalsReportPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  // Filtros
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
  });
  const [sellerName, setSellerName] = useState('all');
  const [paymentMethod, setPaymentMethod] = useState('all');
  const [saleType, setSaleType] = useState('all');
  const [customerId, setCustomerId] = useState('all');
  const [goalId, setGoalId] = useState('all');

  const [customers, setCustomers] = useState<any[]>([]);
  const [goals, setGoals] = useState<GoalRow[]>([]);

  useEffect(() => {
    apiListCustomers().then((c) => setCustomers(Array.isArray(c) ? c : [])).catch(() => {});
    apiListGoals().then((g) => setGoals(Array.isArray(g) ? g : [])).catch(() => {});
  }, []);

  async function fetchReport() {
    setLoading(true);
    try {
      const res = await apiGetSalesGoalsReport({
        startDate,
        endDate,
        sellerId: sellerName !== 'all' ? sellerName : undefined,
        paymentMethod: paymentMethod !== 'all' ? paymentMethod : undefined,
        saleType: saleType !== 'all' ? saleType : undefined,
        customerId: customerId !== 'all' ? customerId : undefined,
        goalId: goalId !== 'all' ? goalId : undefined,
      });
      setData(res.data);
    } catch (err) {
      console.warn('Falha ao carregar relatório:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchReport();
  }, [startDate, endDate, sellerName, paymentMethod, saleType, customerId, goalId]);

  function handleExportExcel() {
    const params = new URLSearchParams({
      startDate,
      endDate,
    });
    if (sellerName !== 'all') params.set('sellerId', sellerName);
    window.open(`/api/v1/reports/sales-goals/export?${params.toString()}`, '_blank');
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
      `Total Vendido: R$ ${s.totalSales?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      canViewProfit ? `Total de Custo: R$ ${s.totalCost?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : null,
      canViewProfit ? `Lucro Bruto: R$ ${s.grossProfit?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : null,
      canViewProfit ? `Margem Média: ${s.marginPercent}%` : null,
      `Vendas: ${s.salesCount}`,
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.4rem' }}>📊</span>
            <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: 'var(--ink)' }}>
              Relatório de Vendas & Metas
            </h1>
            <span className="admin-badge admin-badge--active" style={{ fontSize: '0.75rem' }}>
              {getActiveStore()?.tradeName || 'Loja atual'}
            </span>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--mute)' }}>
            Acompanhe vendas, metas e comissões da loja no período selecionado.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={handleExportExcel}
          >
            <span>📥</span> Exportar Excel (XLSX)
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={handleExportPdf}
          >
            <span>📄</span> Gerar PDF Executivo
          </button>
        </div>
      </div>

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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
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
                ...Array.from(new Set(goals.map(g => g.sellerName).filter((name): name is string => Boolean(name)))).map(name => ({ value: name, label: name })),
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

      {/* CARDS DE RESUMO DO GILVAN */}
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
                Total Vendido
              </span>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--accent, #2dd4bf)', marginTop: '2px' }}>
                R$ {(s.totalSales || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
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
                    {s.goalPercent >= 100 ? 'Meta Atingida (10%)' : 'Aguardando Meta'}
                  </small>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* FECHAMENTO MENSAL DA MARIANA (SECTION 23 DO BRIEFING) */}
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
              <span style={{ color: 'var(--mute)' }}>Vendas:</span>{' '}
              <strong>R$ {s.totalSales?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
            </div>
            {canViewProfit && (
              <>
                <div>
                  <span style={{ color: 'var(--mute)' }}>Custo:</span>{' '}
                  <strong>R$ {s.totalCost?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--mute)' }}>Lucro:</span>{' '}
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
              <span style={{ color: 'var(--mute)' }}>Quantidade de Vendas:</span>{' '}
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
        ) : !data?.rows || data.rows.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--mute)' }}>
            Nenhuma venda localizada para os filtros selecionados.
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
