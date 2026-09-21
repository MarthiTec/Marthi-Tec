import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AdminIcon } from '../../components/AdminIcons';
import {
  CHANNEL_LABEL,
  ecommerceSnapshot,
  listEcommerceChannels,
  listEcommerceOrders,
} from '../../data/ecommerceStore';

/** Demonstrativo do e-commerce no painel — operação fica em /ecommerce. */
export function EcommercePanelPage() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    function refresh() {
      setTick((value) => value + 1);
    }
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, []);

  const snap = useMemo(() => ecommerceSnapshot(), [tick]);
  const channels = useMemo(() => listEcommerceChannels(), [tick]);
  const recentOrders = useMemo(() => listEcommerceOrders().slice(0, 6), [tick]);

  return (
    <section className="admin-page">
      <div className="admin-toolbar" style={{ marginBottom: 12 }}>
        <div>
          <p className="empty" style={{ margin: 0 }}>
            Visão administrativa. Pedidos, anúncios e conexões de canal são operados no app de
            e-commerce.
          </p>
        </div>
        <Link to="/ecommerce" className="btn btn--primary">
          <AdminIcon name="store" />
          Abrir e-commerce
        </Link>
      </div>

      <div className="admin-grid">
        <article className="admin-card">
          <h2>Canais</h2>
          <strong>
            {snap.connected}/{snap.total}
          </strong>
          <p>Conectados / disponíveis.</p>
        </article>
        <article className="admin-card">
          <h2>Pedidos abertos</h2>
          <strong>{snap.openOrders}</strong>
          <p>Aguardando tratamento no app.</p>
        </article>
        <article className="admin-card">
          <h2>Anúncios ativos</h2>
          <strong>{snap.activeListings}</strong>
          <p>Publicados nos marketplaces.</p>
        </article>
        <article className="admin-card">
          <h2>Hubs</h2>
          <strong>{snap.hubs.length}</strong>
          <p>Integrações tipo Tray.</p>
        </article>
      </div>

      <article className="admin-card" style={{ marginTop: 12 }}>
        <h2>Canais</h2>
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Canal</th>
                <th>Status</th>
                <th>Loja</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((channel) => (
                <tr key={channel.id}>
                  <td>{CHANNEL_LABEL[channel.id]}</td>
                  <td>{channel.status === 'connected' ? 'Conectado' : 'Pendente'}</td>
                  <td>{channel.storeName || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="admin-card" style={{ marginTop: 12 }}>
        <div className="admin-toolbar">
          <h2 style={{ margin: 0 }}>Pedidos recentes</h2>
          <Link to="/ecommerce" className="btn btn--ghost">
            Abrir no e-commerce
          </Link>
        </div>
        {recentOrders.length === 0 ? (
          <p className="empty">Nenhum pedido ainda.</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Canal</th>
                  <th>Cliente</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.id}</td>
                    <td>{CHANNEL_LABEL[order.channelId]}</td>
                    <td>{order.customerName}</td>
                    <td>{order.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  );
}
