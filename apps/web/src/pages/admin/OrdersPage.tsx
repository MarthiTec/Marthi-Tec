import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminIcon } from '../../components/AdminIcons';
import { SalesLookup, type SaleHit } from '../../components/SalesLookup';
import { useAuth } from '../../contexts/AuthContext';
import { cancelPosSale } from '../../data/adminStore';
import { userCanCancelSale } from '../../data/erpRegistry';
import { emitNfeFromSale, FISCAL_KIND_LABEL, getFiscalDocumentForRef } from '../../data/fiscalDocuments';
import { hasModule } from '../../data/storePlan';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { usePosTickets } from './usePosTickets';

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Consultar vendas (painel): a mesma consulta do PDV, no banco, com busca por IMEI enquanto digita,
 * cliente, vendedor, período e caixa. Venda externa só aparece para quem tem a permissão.
 */
export function OrdersPage() {
  const { user } = useAuth();
  const fiscalOn = hasModule('fiscal');
  const { confirm, dialog } = useConfirmDialog();
  const { tickets } = usePosTickets();
  const [refreshKey, setRefreshKey] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const openTickets = tickets.filter((ticket) => ticket.status === 'open').length;

  async function cancel(sale: SaleHit) {
    if (!userCanCancelSale(user?.email)) {
      setError('Seu usuário não possui permissão para cancelar vendas.');
      return;
    }
    const ok = await confirm({
      title: 'Cancelar venda?',
      message: `Cancelar a venda ${sale.id} (${money(sale.amount)})? O estoque volta e o valor é estornado no financeiro.`,
      confirmLabel: 'Cancelar venda',
      danger: true,
    });
    if (!ok) return;
    const result = await cancelPosSale(sale.id, 'Cancelado via painel de vendas');
    if (!result.ok) {
      setError(result.error);
      setMessage('');
      return;
    }
    setError('');
    setMessage(`Venda ${sale.id} cancelada. Valor estornado no financeiro e estoque atualizado.`);
    setRefreshKey((value) => value + 1);
  }

  function emit(sale: SaleHit, asNfce: boolean) {
    const result = emitNfeFromSale({ orderId: sale.id, customerName: sale.customerName || 'Consumidor Final', amount: sale.amount, asNfce });
    if (!result.ok) {
      setError(result.error);
      setMessage('');
      return;
    }
    setError('');
    setMessage(`${FISCAL_KIND_LABEL[result.document.kind]} ${result.document.number} · chave ${result.document.accessKey.slice(0, 8)}…`);
    setRefreshKey((value) => value + 1);
  }

  return (
    <section className="admin-page">
      {dialog}
      <article className="admin-card">
        <div className="dash-card__head">
          <div>
            <h2>Consultar vendas</h2>
            <p>PDV e venda externa no mesmo lugar: busque por pedido, IMEI, cliente, vendedor, data ou caixa.</p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {openTickets ? (
              <Link to="/painel/pdv" className="btn btn--ghost">
                <AdminIcon name="totem" /> {openTickets} {openTickets === 1 ? 'interesse aberto' : 'interesses abertos'} no totem
              </Link>
            ) : null}
            <Link to="/caixa" className="btn btn--primary">
              <AdminIcon name="cart" /> Nova venda
            </Link>
          </div>
        </div>
        {message ? <p className="pdv__ok">{message}</p> : null}
        {error ? <p className="pdv__alert">{error}</p> : null}
        <SalesLookup
          refreshKey={refreshKey}
          renderActions={(sale) => {
            const doc = getFiscalDocumentForRef('sale', sale.id);
            const open = sale.status === 'sold';
            return (
              <div className="caixa-panel__actions caixa-sale-actions">
                {sale.type === 'external' && open ? (
                  <Link
                    to={`/painel/venda-externa?edit=${encodeURIComponent(sale.id)}`}
                    className="btn btn--ghost"
                  >
                    <AdminIcon name="edit" /> Corrigir na Venda Externa
                  </Link>
                ) : null}
                {fiscalOn && open && !doc ? (
                  <>
                    <button type="button" className="btn btn--ghost" onClick={() => emit(sale, true)}>
                      <AdminIcon name="receipt" /> Emitir NFC-e
                    </button>
                    <button type="button" className="btn btn--ghost" onClick={() => emit(sale, false)}>
                      <AdminIcon name="fiscal" /> Emitir NF-e
                    </button>
                  </>
                ) : null}
                {doc ? <span className="empty">{FISCAL_KIND_LABEL[doc.kind]} {doc.number}</span> : null}
                <button type="button" className="btn btn--ghost caixa-sale-actions__danger" onClick={() => void cancel(sale)} disabled={!open}>
                  <AdminIcon name="trash" /> Cancelar venda
                </button>
              </div>
            );
          }}
        />
      </article>
    </section>
  );
}
