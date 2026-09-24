import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import { getAdminState, stockItemImages, STOCK_EVENT } from '../../data/adminStore';
import {
  CHANNEL_LABEL,
  listEcommerceChannels,
  listEcommerceListings,
  pauseListing,
  publishStockToChannel,
  removeListing,
  syncEcommerceChannel,
  type EcommerceChannelId,
} from '../../data/ecommerceStore';

export function EcommerceListingsPage() {
  const [tick, setTick] = useState(0);
  const [channelId, setChannelId] = useState<EcommerceChannelId | ''>('');
  const [stockId, setStockId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    function refresh() {
      setTick((value) => value + 1);
    }
    window.addEventListener('marthi-ecommerce-updated', refresh);
    window.addEventListener(STOCK_EVENT, refresh);
    return () => {
      window.removeEventListener('marthi-ecommerce-updated', refresh);
      window.removeEventListener(STOCK_EVENT, refresh);
    };
  }, []);

  const channels = useMemo(
    () => listEcommerceChannels().filter((item) => item.status === 'connected'),
    [tick],
  );
  const stock = useMemo(() => getAdminState().stock, [tick]);
  const listings = useMemo(() => listEcommerceListings(), [tick]);

  const activeChannel = (channelId || channels[0]?.id || '') as EcommerceChannelId | '';

  async function publish() {
    setError('');
    setMessage('');
    if (!activeChannel) {
      setError('Conecte um canal antes de publicar.');
      return;
    }
    if (!stockId) {
      setError('Selecione um produto do estoque.');
      return;
    }
    const result = await publishStockToChannel(activeChannel, stockId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage(`Anúncio ${result.listing.externalId} publicado / atualizado.`);
    setTick((value) => value + 1);
  }

  async function syncAll() {
    setError('');
    setMessage('');
    if (!activeChannel) {
      setError('Selecione um canal conectado.');
      return;
    }
    const result = await syncEcommerceChannel(activeChannel);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage(result.channel.message);
    setTick((value) => value + 1);
  }

  return (
    <section className="admin-page">
      <p className="empty" style={{ marginTop: 0 }}>
        Anúncios ligados ao <Link to="/painel/produtos">estoque Marthi</Link>. Qty, preço e imagens
        atualizam juntos ao salvar o produto ou ao sincronizar o canal. Plataformas exigem foto.
      </p>
      {message ? <p className="empty">{message}</p> : null}
      {error ? <p className="qty-low">{error}</p> : null}

      <article className="admin-card">
        <h2>Publicar do estoque</h2>
        {channels.length === 0 ? (
          <p className="empty">
            Nenhum canal conectado. Configure em <Link to="/ecommerce/conexoes">Conexões</Link>.
          </p>
        ) : (
          <>
            <div className="admin-form">
              <AdminPicker
                label="Canal"
                value={activeChannel}
                options={channels.map((item) => ({
                  value: item.id,
                  label: CHANNEL_LABEL[item.id],
                }))}
                onChange={(value) => setChannelId(value as EcommerceChannelId)}
              />
              <AdminPicker
                label="Produto do estoque"
                value={stockId}
                options={[
                  { value: '', label: 'Selecione…' },
                  ...stock.map((item) => ({
                    value: item.id,
                    label: `${item.name} · ${item.sku || item.id} · qtd ${item.qty}${
                      stockItemImages(item).length ? '' : ' · SEM IMAGEM'
                    }`,
                  })),
                ]}
                onChange={setStockId}
              />
            </div>
            <div className="admin-toolbar" style={{ marginTop: 12 }}>
              <button type="button" className="btn btn--primary" onClick={publish}>
                Publicar / atualizar anúncio
              </button>
              <button type="button" className="btn btn--ghost" onClick={syncAll}>
                Sincronizar canal com estoque
              </button>
              <Link to="/painel/produtos" className="btn btn--ghost">
                Ir ao estoque
              </Link>
            </div>
          </>
        )}
      </article>

      <article className="admin-card">
        <h2>Anúncios ({listings.length})</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Foto</th>
              <th>Canal</th>
              <th>Produto</th>
              <th>SKU</th>
              <th>Qtd</th>
              <th>Preço</th>
              <th>Status</th>
              <th>Sync</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {listings.length === 0 ? (
              <tr>
                <td colSpan={9} className="empty">
                  Nenhum anúncio publicado.
                </td>
              </tr>
            ) : (
              listings.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.images[0] ? (
                      <img
                        src={item.images[0]}
                        alt=""
                        width={44}
                        height={44}
                        style={{ objectFit: 'cover', borderRadius: 8 }}
                      />
                    ) : (
                      <span className="qty-low">sem foto</span>
                    )}
                  </td>
                  <td>
                    <Link to={`/ecommerce/${item.channelId}`}>
                      {CHANNEL_LABEL[item.channelId]}
                    </Link>
                  </td>
                  <td>
                    <strong>{item.title}</strong>
                    <div className="empty" style={{ margin: 0 }}>
                      {item.message}
                    </div>
                  </td>
                  <td>{item.sku}</td>
                  <td>{item.qty}</td>
                  <td>
                    {item.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                  <td>{item.status}</td>
                  <td>
                    {item.syncedAt
                      ? new Date(item.syncedAt).toLocaleString('pt-BR')
                      : '—'}
                  </td>
                  <td className="admin-table__action">
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => {
                        void pauseListing(item.id).then(() => setTick((value) => value + 1));
                      }}
                    >
                      Pausar
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => {
                        void removeListing(item.id).then(() => setTick((value) => value + 1));
                      }}
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </article>
    </section>
  );
}
