import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import {
  CHANNEL_LABEL,
  listEcommerceOrders,
  ORDER_STATUS_LABEL,
  type EcommerceChannelId,
} from '../../data/ecommerceStore';

export function EcommerceOrdersPage() {
  const [channelFilter, setChannelFilter] = useState<'all' | EcommerceChannelId>('all');
  const orders = useMemo(
    () =>
      channelFilter === 'all' ? listEcommerceOrders() : listEcommerceOrders(channelFilter),
    [channelFilter],
  );

  return (
    <section className="admin-page">
      <div className="admin-toolbar">
        <AdminPicker
          compact
          label="Canal"
          value={channelFilter}
          options={[
            { value: 'all', label: 'Todos os canais' },
            { value: 'mercadolivre', label: 'Mercado Livre' },
            { value: 'shopee', label: 'Shopee' },
            { value: 'ifood', label: 'iFood' },
            { value: 'amazon', label: 'Amazon' },
            { value: 'tray', label: 'Tray' },
          ]}
          onChange={(value) => setChannelFilter(value as 'all' | EcommerceChannelId)}
        />
        <Link to="/ecommerce/conexoes" className="btn btn--ghost">
          Conexões
        </Link>
      </div>

      <article className="admin-card">
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Canal</th>
              <th>Externo</th>
              <th>Cliente</th>
              <th>Valor</th>
              <th>Status</th>
              <th>Quando</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty">
                  Nenhum pedido.
                </td>
              </tr>
            ) : (
              orders.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>
                    <Link to={`/ecommerce/${item.channelId}`}>{CHANNEL_LABEL[item.channelId]}</Link>
                  </td>
                  <td>{item.externalId}</td>
                  <td>{item.customerName}</td>
                  <td>
                    {item.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                  <td>{ORDER_STATUS_LABEL[item.status]}</td>
                  <td>{new Date(item.createdAt).toLocaleString('pt-BR')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </article>
    </section>
  );
}
