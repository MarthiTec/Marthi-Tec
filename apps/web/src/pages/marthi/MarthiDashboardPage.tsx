import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DonutChart, DualBarChart, LineAreaChart } from '../../components/MiniCharts';
import { money } from '../../data/financeBook';
import {
  getMarthiDashboardMetrics,
  listMarthiClients,
  MARTHI_CLIENTS_EVENT,
  type MarthiDashboardMetrics,
} from '../../data/marthiClientsStore';
import { PRESENCE_EVENT } from '../../data/presenceStore';

function monthLabel(date: Date) {
  return date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
}

/** Receita recorrente acumulada nos últimos 6 meses (clientes já contratados). */
function buildRevenueCurve(clients: ReturnType<typeof listMarthiClients>) {
  const now = new Date();
  const points: { label: string; value: number }[] = [];
  for (let i = 5; i >= 0; i -= 1) {
    const cursor = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
    const value = clients
      .filter((client) => {
        const started = new Date(client.contractedAt).getTime();
        return (
          !Number.isNaN(started) &&
          started <= end.getTime() &&
          client.status !== 'inactive'
        );
      })
      .reduce((sum, client) => sum + (client.paymentOk ? client.monthlyAmount : 0), 0);
    points.push({ label: monthLabel(cursor), value });
  }
  return points;
}

export function MarthiDashboardPage() {
  const [metrics, setMetrics] = useState<MarthiDashboardMetrics>(() => getMarthiDashboardMetrics());
  const [clients, setClients] = useState(() => listMarthiClients());

  useEffect(() => {
    function refresh() {
      setMetrics(getMarthiDashboardMetrics());
      setClients(listMarthiClients());
    }
    refresh();
    window.addEventListener(MARTHI_CLIENTS_EVENT, refresh);
    window.addEventListener(PRESENCE_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(MARTHI_CLIENTS_EVENT, refresh);
      window.removeEventListener(PRESENCE_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const revenueCurve = useMemo(() => buildRevenueCurve(clients), [clients]);

  const statusBars = useMemo(
    () => [
      { label: 'Ativos', a: metrics.activeCount, b: metrics.onlineCount },
      { label: 'Atraso', a: metrics.paymentLateCount, b: 0 },
      { label: 'Bloq.', a: metrics.blockedCount, b: 0 },
      { label: 'Inat.', a: metrics.inactiveCount, b: 0 },
    ],
    [metrics],
  );

  const planSlices = useMemo(() => {
    const bronze = clients.filter((c) => c.planId === 'bronze' && c.status !== 'inactive');
    const silver = clients.filter((c) => c.planId === 'silver' && c.status !== 'inactive');
    const golden = clients.filter((c) => c.planId === 'golden' && c.status !== 'inactive');
    return [
      {
        label: 'Bronze',
        value: bronze.reduce((sum, c) => sum + c.monthlyAmount, 0),
        tone: '#b45309',
      },
      {
        label: 'Silver',
        value: silver.reduce((sum, c) => sum + c.monthlyAmount, 0),
        tone: '#64748b',
      },
      {
        label: 'Golden',
        value: golden.reduce((sum, c) => sum + c.monthlyAmount, 0),
        tone: '#ca8a04',
      },
    ].filter((slice) => slice.value > 0);
  }, [clients]);

  return (
    <section className="admin-page">
      <div className="dash-hero">
        <div>
          <p className="empty" style={{ margin: 0 }}>
            Visão geral dos parceiros contratados
          </p>
          <h1 className="dash-hero__title">Dashboard Marthi</h1>
        </div>
        <div className="dash-hero__launch">
          <Link to="/admin/clientes" className="btn btn--primary">
            Ver clientes
          </Link>
        </div>
      </div>

      <div className="admin-grid">
        <article className="admin-card">
          <h2>Clientes pagantes</h2>
          <strong>{metrics.payingCount}</strong>
          <p>Ativos com pagamento em dia.</p>
        </article>
        <article className="admin-card">
          <h2>Receita mensal</h2>
          <strong className="price-red">{money(metrics.monthlyRevenue)}</strong>
          <p>Soma dos planos Bronze / Silver / Golden.</p>
        </article>
        <article className="admin-card">
          <h2>Online agora</h2>
          <strong>{metrics.onlineCount}</strong>
          <p>Operadores com presença ativa.</p>
        </article>
        <article className="admin-card">
          <h2>Pagamento em atraso</h2>
          <strong className={metrics.paymentLateCount ? 'qty-low' : ''}>
            {metrics.paymentLateCount}
          </strong>
          <p>Clientes com flag “não”.</p>
        </article>
      </div>

      <div className="dash-charts">
        <article className="admin-card">
          <div className="dash-card__head">
            <h2>Status da base</h2>
            <span className="empty">Clientes × online · visão operacional</span>
          </div>
          <DualBarChart series={statusBars} aLabel="Clientes" bLabel="Online" />
        </article>
        <article className="admin-card">
          <div className="dash-card__head">
            <h2>Curva de receita</h2>
            <span className="empty">MRR em dia · últimos 6 meses</span>
          </div>
          <LineAreaChart series={revenueCurve} label="Receita recorrente" />
        </article>
        <article className="admin-card">
          <div className="dash-card__head">
            <h2>Mix de planos</h2>
            <span className="empty">Receita mensal por plano</span>
          </div>
          <DonutChart
            slices={planSlices}
            center={money(metrics.monthlyRevenue).replace(/\s/g, '\u00a0')}
          />
        </article>
      </div>

      <div className="admin-grid dash-kpis">
        <article className="admin-card">
          <h2>Ativos</h2>
          <strong>{metrics.activeCount}</strong>
          <p>Status operacional ativo.</p>
        </article>
        <article className="admin-card">
          <h2>Bloqueados</h2>
          <strong className={metrics.blockedCount ? 'qty-low' : ''}>{metrics.blockedCount}</strong>
          <p>Bloqueio por falta de pagamento.</p>
        </article>
        <article className="admin-card">
          <h2>Inativos</h2>
          <strong>{metrics.inactiveCount}</strong>
          <p>Contas inativadas manualmente.</p>
        </article>
        <article className="admin-card">
          <h2>Distribuição de planos</h2>
          <p className="marthi-plan-dist">
            <span>
              Bronze <strong>{metrics.planDistribution.bronze}</strong>
            </span>
            <span>
              Silver <strong>{metrics.planDistribution.silver}</strong>
            </span>
            <span>
              Golden <strong>{metrics.planDistribution.golden}</strong>
            </span>
          </p>
        </article>
      </div>
    </section>
  );
}
