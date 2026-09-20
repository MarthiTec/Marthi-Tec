import { Link } from 'react-router-dom';
import { CHANNEL_LABEL, listEcommerceChannels } from '../../data/ecommerceStore';

export function EcommerceConnectionsPage() {
  const channels = listEcommerceChannels();
  const markets = channels.filter((item) => item.kind === 'marketplace');
  const hubs = channels.filter((item) => item.kind === 'hub');

  return (
    <section className="admin-page">
      <p className="empty" style={{ marginTop: 0 }}>
        Conecte marketplaces e hubs. OAuth / API keys ficam no Nest; aqui o fluxo MVP é local.
      </p>

      <h2 style={{ margin: '8px 0', fontSize: '1rem' }}>Marketplaces</h2>
      <div className="ecommerce-home__grid">
        {markets.map((item) => (
          <Link key={item.id} to={`/ecommerce/${item.id}`} className="ecommerce-home__card">
            <em>Marketplace</em>
            <strong>{CHANNEL_LABEL[item.id]}</strong>
            <span>{item.blurb}</span>
            <span className={item.status === 'connected' ? 'is-ok' : 'is-wait'}>
              {item.status === 'connected' ? `Conectado · ${item.storeName}` : 'Não conectado'}
            </span>
          </Link>
        ))}
      </div>

      <h2 style={{ margin: '18px 0 8px', fontSize: '1rem' }}>Hubs</h2>
      <div className="ecommerce-home__grid">
        {hubs.map((item) => (
          <Link key={item.id} to={`/ecommerce/${item.id}`} className="ecommerce-home__card">
            <em>Hub</em>
            <strong>{CHANNEL_LABEL[item.id]}</strong>
            <span>{item.blurb}</span>
            <span className={item.status === 'connected' ? 'is-ok' : 'is-wait'}>
              {item.status === 'connected' ? `Conectado · ${item.storeName}` : 'Não conectado'}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
