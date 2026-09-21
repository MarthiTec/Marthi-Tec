import { Link } from 'react-router-dom';
import { closeSale, parsePriceLabel } from '../../data/adminStore';
import { updateQueueTicket, ticketVariation } from '../../data/posQueueStore';
import { updatePosTicket } from '../../services/pos';
import { usePosTickets } from './usePosTickets';

export function PosPage() {
  const { tickets, error, loading, reload } = usePosTickets();
  const open = tickets.filter((item) => item.status === 'open');

  async function closeTicket(id: string, status: 'sold' | 'cancelled') {
    const ticket = tickets.find((item) => item.id === id);
    if (!ticket) return;
    updateQueueTicket(id, status);
    try {
      await updatePosTicket(id, status);
    } catch {
      /* fila local já atualizou */
    }
    if (status === 'sold') {
      try {
        await closeSale({
          ticketId: ticket.id,
          customerName: ticket.customerName,
          customerPhone: ticket.customerPhone,
          productName: ticket.productName,
          amount: parsePriceLabel(ticket.priceLabel),
          payment: ticket.payment,
        });
      } catch {
        /* fila local já atualizou; venda pode falhar offline */
      }
    }
    await reload();
  }

  return (
    <section className="admin-page">
      <article className="admin-card">
        <h2>PDV · fila do totem</h2>
        <p>
          Toda proposta confirmada no totem cai nesta fila para o representante. Venda no balcão usa
          SKU, código de barras ou IMEI em Lançar venda.
        </p>
        <div className="admin-toolbar" style={{ marginTop: 12 }}>
          <Link to="/caixa" className="btn btn--primary">
            Abrir caixa (PDV)
          </Link>
        </div>
      </article>
      {error && <p className="empty">{error} Suba a API (`npm run dev:api`) para receber o totem.</p>}
      {loading && <p className="empty">Atualizando fila…</p>}
      {open.length === 0 && !loading ? (
        <p className="empty">Nenhum ticket aberto. Faça um fluxo no totem para testar.</p>
      ) : (
        open.map((ticket) => (
          <article key={ticket.id} className="admin-card ticket">
            <div className="ticket__meta">
              <span className="badge badge--open">{ticket.id}</span>
              <span>{new Date(ticket.createdAt).toLocaleTimeString('pt-BR')}</span>
            </div>
            <h3>{ticket.customerName}</h3>
            <p>
              {ticket.customerPhone} · {ticket.productName} · {ticketVariation(ticket)}
            </p>
            <p>
              {ticket.payment}
              {ticket.installment ? ` ${ticket.installment}` : ''}
            </p>
            <strong className="price-red">{ticket.priceLabel}</strong>
            <div className="admin-toolbar">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void closeTicket(ticket.id, 'sold')}
              >
                Fechar venda
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => void closeTicket(ticket.id, 'cancelled')}
              >
                Cancelar
              </button>
            </div>
          </article>
        ))
      )}
    </section>
  );
}
