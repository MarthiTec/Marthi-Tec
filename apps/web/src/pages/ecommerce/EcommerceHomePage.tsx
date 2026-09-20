import { Link } from 'react-router-dom';
import {
  CHANNEL_LABEL,
  ecommerceSnapshot,
  listEcommerceChannels,
  type EcommerceChannelId,
} from '../../data/ecommerceStore';

const QUICK: { id: EcommerceChannelId; to: string; tag: string }[] = [
  { id: 'mercadolivre', to: '/ecommerce/mercadolivre', tag: 'Marketplace' },
  { id: 'shopee', to: '/ecommerce/shopee', tag: 'Marketplace' },
  { id: 'ifood', to: '/ecommerce/ifood', tag: 'Marketplace' },
  { id: 'amazon', to: '/ecommerce/amazon', tag: 'Marketplace' },
  { id: 'tray', to: '/ecommerce/tray', tag: 'Hub' },
];

export function EcommerceHomePage() {
  const snap = ecommerceSnapshot();
  const channels = listEcommerceChannels();

  return (
    <div className="ecommerce-home">
      <p className="empty" style={{ margin: 0 }}>
        Estoque Marthi → anúncios com foto, qty e preço. Configure as chaves de cada plataforma e
        publique em Anúncios.
      </p>

      <div className="ecommerce-home__kpis">
        <div className="ecommerce-home__kpi">
          <strong>
            {snap.connected}/{snap.total}
          </strong>
          <span>Canais conectados</span>
        </div>
        <div className="ecommerce-home__kpi">
          <strong>{snap.openOrders}</strong>
          <span>Pedidos em aberto</span>
        </div>
        <div className="ecommerce-home__kpi">
          <strong>{snap.activeListings}</strong>
          <span>Anúncios ativos</span>
        </div>
        <div className="ecommerce-home__kpi">
          <strong>{snap.hubs.length}</strong>
          <span>Hubs</span>
        </div>
      </div>

      <div className="admin-toolbar">
        <Link to="/ecommerce/pedidos" className="btn btn--primary">
          Ver pedidos
        </Link>
        <Link to="/ecommerce/conexoes" className="btn btn--ghost">
          Gerenciar conexões
        </Link>
        <Link to="/ecommerce/anuncios" className="btn btn--ghost">
          Anúncios
        </Link>
      </div>

      <div className="ecommerce-home__grid">
        {QUICK.map((item) => {
          const channel = channels.find((entry) => entry.id === item.id);
          const connected = channel?.status === 'connected';
          return (
            <Link key={item.id} to={item.to} className="ecommerce-home__card">
              <em>{item.tag}</em>
              <strong>{CHANNEL_LABEL[item.id]}</strong>
              <span>{channel?.blurb}</span>
              <span className={connected ? 'is-ok' : 'is-wait'}>
                {connected ? `Conectado · ${channel?.storeName}` : 'Não conectado'}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
