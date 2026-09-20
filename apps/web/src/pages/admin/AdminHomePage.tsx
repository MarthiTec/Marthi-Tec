import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AdminIcon } from '../../components/AdminIcons';
import { DonutChart, DualBarChart, LineAreaChart } from '../../components/MiniCharts';
import { useAuth } from '../../contexts/AuthContext';
import { getDashboardSnapshot } from '../../data/dashboardStats';
import { money } from '../../data/financeBook';
import { userIsStoreAdmin } from '../../data/erpRegistry';
import { getOperatorProfile } from '../../data/operatorProfile';
import { ticketVariation } from '../../data/posQueueStore';
import { hasModule } from '../../data/storePlan';
import { usePosTickets } from './usePosTickets';

export function AdminHomePage() {
  const { user } = useAuth();
  const profile = getOperatorProfile(user?.name ?? 'Operador');
  const isAdmin = userIsStoreAdmin(user?.email);
  const { tickets } = usePosTickets();
  const openTickets = tickets.filter((item) => item.status === 'open');
  const dash = useMemo(() => getDashboardSnapshot(7), [tickets, openTickets.length]);

  const greeting = useMemo(
    () =>
      openTickets.length > 0
        ? `${profile.displayName}, há atendimento vindo do totem.`
        : `${profile.displayName}, acompanhe o rendimento da loja.`,
    [openTickets.length, profile.displayName],
  );

  return (
    <section className="admin-page">
      <div className="dash-hero">
        <div>
          <p className="empty" style={{ margin: 0 }}>
            {greeting}
          </p>
          <h1 className="dash-hero__title">Dashboard</h1>
        </div>
        <div className="dash-hero__launch">
          {hasModule('erp') ? (
            <Link to="/caixa" className="btn btn--primary">
              <AdminIcon name="cart" />
              Abrir PDV
            </Link>
          ) : null}
          {hasModule('os') ? (
            <Link to="/os" className="btn btn--ghost">
              <AdminIcon name="wrench" />
              Abrir oficina
            </Link>
          ) : null}
          {hasModule('fiscal') ? (
            <Link to="/fiscal" className="btn btn--ghost">
              <AdminIcon name="fiscal" />
              Abrir emissor
            </Link>
          ) : null}
          {hasModule('ecommerce') ? (
            <Link to="/ecommerce" className="btn btn--ghost">
              <AdminIcon name="store" />
              Abrir e-commerce
            </Link>
          ) : null}
            <Link to="/painel/crm" className="btn btn--ghost">
              <AdminIcon name="people" />
              Visão CRM
            </Link>
            <Link to="/crm" className="btn btn--ghost">
              Abrir CRM
            </Link>
          {hasModule('totem') ? (
            <Link to="/totem" className="btn btn--ghost">
              <AdminIcon name="totem" />
              Abrir Totem
            </Link>
          ) : null}
          <Link to="/painel/financeiro" className="btn btn--ghost">
            <AdminIcon name="ops" />
            Financeiro
          </Link>
        </div>
      </div>

      <div className="admin-grid">
        <article className="admin-card">
          <h2>Fila do PDV</h2>
          <strong>{openTickets.length}</strong>
          <p>Pedidos do totem aguardando fechamento.</p>
        </article>
        <article className="admin-card">
          <h2>Vendas</h2>
          <strong>{dash.soldCount}</strong>
          <p>Pedidos concluídos nesta loja.</p>
        </article>
        <article className="admin-card">
          <h2>Estoque baixo</h2>
          <strong className={dash.lowStock ? 'qty-low' : ''}>{dash.lowStock}</strong>
          <p>Itens no mínimo ou abaixo.</p>
        </article>
        <article className="admin-card">
          <h2>Caixa</h2>
          <strong>{money(dash.cashBalance)}</strong>
          <p>Saldo do extrato local.</p>
        </article>
      </div>

      <div className="admin-grid dash-kpis">
        <article className="admin-card">
          <h2>Receita 7 dias</h2>
          <strong className="price-red">{money(dash.revenuePeriod)}</strong>
          <p>Entradas no período.</p>
        </article>
        <article className="admin-card">
          <h2>Despesas 7 dias</h2>
          <strong className="qty-low">{money(dash.expensePeriod)}</strong>
          <p>Saídas no período.</p>
        </article>
        <article className="admin-card">
          <h2>Resultado</h2>
          <strong className={dash.resultPeriod >= 0 ? 'price-red' : 'qty-low'}>
            {money(dash.resultPeriod)}
          </strong>
          <p>Receita − despesa (7 dias).</p>
        </article>
        <article className="admin-card">
          <h2>Tesouraria</h2>
          <strong>{money(dash.treasury)}</strong>
          <p>
            A receber {money(dash.receivablesOpen)} · a pagar {money(dash.payablesOpen)}
          </p>
        </article>
      </div>

      <div className="dash-charts">
        <article className="admin-card">
          <div className="dash-card__head">
            <h2>Rendimento diário</h2>
            <span className="empty">Entradas × saídas · últimos 7 dias</span>
          </div>
          <DualBarChart
            series={dash.series.map((day) => ({
              label: day.label,
              a: day.inflow,
              b: day.outflow,
            }))}
          />
        </article>
        <article className="admin-card">
          <div className="dash-card__head">
            <h2>Curva de receita</h2>
            <span className="empty">Tendência do caixa</span>
          </div>
          <LineAreaChart
            series={dash.series.map((day) => ({ label: day.label, value: day.inflow }))}
          />
        </article>
        <article className="admin-card">
          <div className="dash-card__head">
            <h2>Origem das entradas</h2>
            <span className="empty">Mix do período · OS abertas: {dash.openOs}</span>
          </div>
          <DonutChart
            slices={dash.mix}
            center={money(dash.revenuePeriod).replace(/\s/g, '\u00a0')}
          />
        </article>
      </div>

      {hasModule('os') ? (
        <>
          <div className="admin-grid dash-kpis">
            <article className="admin-card">
              <h2>Mais serviços fechados</h2>
              <strong>{dash.topCloser?.name ?? '—'}</strong>
              <p>
                {dash.topCloser
                  ? `${dash.topCloser.closedCount} OS entregues · ticket médio ${money(dash.topCloser.avgTicket)}`
                  : 'Sem entregas registradas.'}
              </p>
            </article>
            <article className="admin-card">
              <h2>Maior retorno financeiro</h2>
              <strong className="price-red">
                {dash.topEarner ? money(dash.topEarner.revenue) : '—'}
              </strong>
              <p>
                {dash.topEarner
                  ? `${dash.topEarner.name} · ${dash.topEarner.closedCount} OS`
                  : 'Sem receita de OS ainda.'}
              </p>
            </article>
            <article className="admin-card">
              <h2>Mais retornos pós-serviço</h2>
              <strong className={dash.topReturns ? 'qty-low' : ''}>
                {dash.topReturns?.name ?? '—'}
              </strong>
              <p>
                {dash.topReturns
                  ? `${dash.topReturns.returns} retorno(s) no mesmo equipamento`
                  : 'Nenhum retorno detectado por IMEI/série.'}
              </p>
            </article>
            <article className="admin-card">
              <h2>Taxa de retorno</h2>
              <strong>{(dash.returnRate * 100).toFixed(0)}%</strong>
              <p>
                {dash.deliveredCount} entregues · OS abertas {dash.openOs}
              </p>
            </article>
          </div>

          <article className="admin-card">
            <div className="dash-card__head">
              <h2>Ranking da oficina</h2>
              <span className="empty">Visão gerencial · poucos acessos a este painel</span>
            </div>
            {dash.technicians.length === 0 ? (
              <p className="empty">Nenhum técnico com OS ainda.</p>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Técnico</th>
                    <th>Fechadas</th>
                    <th>Receita</th>
                    <th>Ticket</th>
                    <th>Em aberto</th>
                    <th>Retornos</th>
                  </tr>
                </thead>
                <tbody>
                  {[...dash.technicians]
                    .sort((a, b) => b.revenue - a.revenue || b.closedCount - a.closedCount)
                    .map((row, index) => (
                      <tr key={row.name}>
                        <td>{index + 1}</td>
                        <td>{row.name}</td>
                        <td>{row.closedCount}</td>
                        <td className="price-red">{money(row.revenue)}</td>
                        <td>{money(row.avgTicket)}</td>
                        <td>{row.inProgress}</td>
                        <td className={row.returns > 0 ? 'qty-low' : ''}>{row.returns}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </article>
        </>
      ) : null}

      <div className="admin-ops">
        <article className="admin-card">
          <h2>Operações em aberto</h2>
          {openTickets.length === 0 ? (
            <p className="empty">
              Nenhum interesse no totem agora. Quando o cliente confirmar, cai aqui.
            </p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Produto</th>
                  <th>Valor</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {openTickets.slice(0, 5).map((ticket) => (
                  <tr key={ticket.id}>
                    <td>{ticket.customerName}</td>
                    <td>
                      {ticket.productName} · {ticketVariation(ticket)}
                    </td>
                    <td className="price-red">{ticket.priceLabel}</td>
                    <td className="admin-table__action">
                      <Link
                        to="/painel/pdv"
                        className="btn btn--primary btn--icon"
                        aria-label="Abrir PDV"
                        title="Abrir PDV"
                      >
                        <AdminIcon name="cart" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>

        <article className="admin-card">
          <h2>Atalhos da loja</h2>
          <p>Sistemas da loja e cadastros do dia a dia.</p>
          <div className="admin-toolbar admin-toolbar--stack">
            {hasModule('erp') ? (
              <Link to="/caixa" className="btn btn--primary">
                <AdminIcon name="cart" />
                Abrir PDV / Caixa
              </Link>
            ) : null}
            {hasModule('totem') ? (
              <Link to="/totem" className="btn btn--ghost">
                <AdminIcon name="totem" />
                Abrir Totem
              </Link>
            ) : null}
            {hasModule('totem') ? (
              <Link to="/painel/totem" className="btn btn--ghost">
                Configurar totem
              </Link>
            ) : null}
            {hasModule('os') ? (
              <>
                <Link to="/painel/os" className="btn btn--ghost">
                  <AdminIcon name="wrench" />
                  Quadro OS (painel)
                </Link>
                <Link to="/os" className="btn btn--ghost">
                  Abrir oficina
                </Link>
              </>
            ) : null}
            {hasModule('ecommerce') ? (
              <>
                <Link to="/ecommerce" className="btn btn--ghost">
                  <AdminIcon name="store" />
                  Abrir e-commerce
                </Link>
                <Link to="/ecommerce/pedidos" className="btn btn--ghost">
                  Pedidos online
                </Link>
                <Link to="/ecommerce/mercadolivre" className="btn btn--ghost">
                  Mercado Livre
                </Link>
                <Link to="/ecommerce/tray" className="btn btn--ghost">
                  Tray (hub)
                </Link>
              </>
            ) : null}
            <Link to="/painel/crm" className="btn btn--ghost">
              <AdminIcon name="people" />
              Visão CRM (painel)
            </Link>
            <Link to="/crm" className="btn btn--primary">
              Abrir CRM
            </Link>
            {hasModule('erp') ? (
              <>
                <Link to="/painel/financeiro?tab=receber" className="btn btn--ghost">
                  Contas a receber
                </Link>
                <Link to="/painel/financeiro?tab=pagar" className="btn btn--ghost">
                  Contas a pagar
                </Link>
                <Link to="/painel/financeiro?tab=dre" className="btn btn--ghost">
                  DRE
                </Link>
                <Link to="/painel/produtos" className="btn btn--ghost">
                  <AdminIcon name="box" />
                  Produtos
                </Link>
              </>
            ) : null}
            {isAdmin ? (
              <>
                <Link to="/painel/plano" className="btn btn--ghost">
                  <AdminIcon name="plan" />
                  Plano
                </Link>
                <Link to="/painel/ajuda" className="btn btn--ghost">
                  <AdminIcon name="help" />
                  Ajuda
                </Link>
              </>
            ) : null}
          </div>
          {dash.lowStock > 0 ? (
            <p className="qty-low admin-note">{dash.lowStock} item(ns) abaixo do mínimo.</p>
          ) : (
            <p className="empty admin-note">Estoque dentro do mínimo cadastrado.</p>
          )}
        </article>
      </div>
    </section>
  );
}
