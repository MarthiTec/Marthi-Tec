import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getAdminState } from '../../data/adminStore';
import { getOperatorProfile } from '../../data/operatorProfile';
import { ticketVariation } from '../../data/posQueueStore';
import { hasModule } from '../../data/storePlan';
import { useAuth } from '../../contexts/AuthContext';
import { usePosTickets } from './usePosTickets';

export function AdminHomePage() {
  const { user } = useAuth();
  const profile = getOperatorProfile(user?.name ?? 'Operador');
  const state = getAdminState();
  const { tickets } = usePosTickets();
  const openTickets = tickets.filter((item) => item.status === 'open');
  const lowStock = state.stock.filter((item) => item.qty <= item.minQty);
  const soldToday = state.orders.filter((item) => item.status === 'sold').length;
  const cash = state.finance.reduce(
    (sum, item) => sum + (item.type === 'in' ? item.amount : -item.amount),
    0,
  );

  const greeting = useMemo(
    () =>
      openTickets.length > 0
        ? `${profile.displayName}, há atendimento vindo do totem.`
        : `${profile.displayName}, a fila do PDV está limpa.`,
    [openTickets.length, profile.displayName],
  );

  return (
    <section className="admin-page">
      <p className="empty">{greeting} Operação central da Sua Loja no ERP Marthi.</p>
      <div className="admin-grid">
        <article className="admin-card">
          <h2>Fila do PDV</h2>
          <strong>{openTickets.length}</strong>
          <p>Pedidos do totem aguardando fechamento.</p>
        </article>
        <article className="admin-card">
          <h2>Vendas</h2>
          <strong>{soldToday}</strong>
          <p>Pedidos concluídos nesta loja.</p>
        </article>
        <article className="admin-card">
          <h2>Estoque baixo</h2>
          <strong className={lowStock.length ? 'qty-low' : ''}>{lowStock.length}</strong>
          <p>Itens no mínimo ou abaixo.</p>
        </article>
        <article className="admin-card">
          <h2>Caixa</h2>
          <strong>
            {cash.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </strong>
          <p>Saldo do financeiro local.</p>
        </article>
      </div>

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
                    <td>
                      <Link to="/painel/pdv" className="btn btn--primary">
                        Abrir PDV
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
          <p>Cadastros e caixa da operação no centro do dia.</p>
          <div className="admin-toolbar admin-toolbar--stack">
            {hasModule('totem') ? (
              <Link to="/painel/totem" className="btn btn--ghost">
                Modo do totem
              </Link>
            ) : null}
            {hasModule('presales') ? (
              <Link to="/painel/pdv/venda" className="btn btn--primary">
                Lançar venda
              </Link>
            ) : null}
            {hasModule('os') ? (
              <Link to="/painel/os" className="btn btn--ghost">
                Ordens de serviço
              </Link>
            ) : null}
            {hasModule('erp') ? (
              <>
                <Link to="/painel/clientes" className="btn btn--ghost">
                  Clientes
                </Link>
                <Link to="/painel/estoque" className="btn btn--ghost">
                  Estoque
                </Link>
                <Link to="/painel/atributos" className="btn btn--ghost">
                  Atributos
                </Link>
                <Link to="/painel/tabelas" className="btn btn--ghost">
                  Tabelas de preço
                </Link>
                <Link to="/painel/pagamentos" className="btn btn--ghost">
                  Formas de pagamento
                </Link>
                <Link to="/painel/financeiro" className="btn btn--ghost">
                  Financeiro
                </Link>
              </>
            ) : null}
            <Link to="/painel/plano" className="btn btn--ghost">
              Plano da loja
            </Link>
            <Link to="/painel/perfil" className="btn btn--ghost">
              Meu perfil
            </Link>
          </div>
          {lowStock.length > 0 ? (
            <p className="qty-low admin-note">
              {lowStock.length} item(ns) abaixo do mínimo.
            </p>
          ) : (
            <p className="empty admin-note">
              Estoque dentro do mínimo cadastrado.
            </p>
          )}
        </article>
      </div>
    </section>
  );
}
