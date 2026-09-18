import { getAdminState } from '../../data/adminStore';
import { usePosTickets } from './usePosTickets';

export function OrdersPage() {
  const orders = getAdminState().orders;
  const { tickets } = usePosTickets();
  const rows = [
    ...orders.map((order) => ({
      id: order.id,
      customer: order.customerName,
      product: order.productName,
      amount: order.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      status: order.status,
      when: order.createdAt,
    })),
    ...tickets
      .filter((ticket) => ticket.status === 'open')
      .map((ticket) => ({
        id: ticket.id,
        customer: ticket.customerName,
        product: `${ticket.productName} · ${ticket.color}`,
        amount: ticket.priceLabel,
        status: 'open' as const,
        when: ticket.createdAt,
      })),
  ].sort((a, b) => b.when.localeCompare(a.when));

  return (
    <section className="admin-page">
      <article className="admin-card">
        <h2>Pedidos de venda</h2>
        <p>Abertos no totem e fechados no PDV aparecem nesta mesma lista.</p>
        {rows.length === 0 ? (
          <p className="empty">Nenhum pedido ainda.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Cliente</th>
                <th>Produto</th>
                <th>Valor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{row.customer}</td>
                  <td>{row.product}</td>
                  <td className="price-red">{row.amount}</td>
                  <td>
                    <span className={`badge ${row.status === 'open' ? 'badge--open' : 'badge--sold'}`}>
                      {row.status === 'open' ? 'Aberto no PDV' : 'Vendido'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>
    </section>
  );
}
