import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { money } from '../../data/financeBook';
import {
  getMarthiDashboardMetrics,
  MARTHI_CLIENTS_EVENT,
  type MarthiDashboardMetrics,
} from '../../data/marthiClientsStore';
import { PRESENCE_EVENT } from '../../data/presenceStore';

export function MarthiDashboardPage() {
  const [metrics, setMetrics] = useState<MarthiDashboardMetrics>(() => getMarthiDashboardMetrics());

  useEffect(() => {
    function refresh() {
      setMetrics(getMarthiDashboardMetrics());
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
          <Link to="/marthi/clientes" className="btn btn--primary">
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
