import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  CHANNEL_CONNECT_GUIDE,
  CHANNEL_CREDENTIAL_FIELDS,
  CHANNEL_LABEL,
  connectEcommerceChannel,
  disconnectEcommerceChannel,
  getEcommerceChannel,
  listEcommerceListings,
  listEcommerceOrders,
  ORDER_STATUS_LABEL,
  saveChannelCredentials,
  syncEcommerceChannel,
  type EcommerceChannelId,
} from '../../data/ecommerceStore';
import { OperatorAccountPage } from '../shared/OperatorAccountPage';

const VALID: EcommerceChannelId[] = ['mercadolivre', 'shopee', 'ifood', 'amazon', 'tray'];

function isChannelId(value: string | undefined): value is EcommerceChannelId {
  return Boolean(value && VALID.includes(value as EcommerceChannelId));
}

export function EcommerceChannelPage() {
  const { channelId: raw } = useParams();
  if (raw === 'conta' || raw === 'perfil') {
    return <OperatorAccountPage />;
  }
  const channelId = isChannelId(raw) ? raw : null;
  const [tick, setTick] = useState(0);
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showSecrets, setShowSecrets] = useState(false);

  const channel = useMemo(
    () => (channelId ? getEcommerceChannel(channelId) : null),
    [channelId, tick],
  );
  const orders = useMemo(
    () => (channelId ? listEcommerceOrders(channelId) : []),
    [channelId, tick],
  );
  const listings = useMemo(
    () => (channelId ? listEcommerceListings(channelId) : []),
    [channelId, tick],
  );
  const fields = channelId ? CHANNEL_CREDENTIAL_FIELDS[channelId] : [];

  useEffect(() => {
    if (!channel) return;
    setCreds({ ...channel.credentials });
  }, [channel?.id, tick]);

  if (!channelId || !channel) {
    return (
      <section className="admin-page">
        <p className="qty-low">Canal não encontrado.</p>
        <Link to="/ecommerce" className="btn btn--ghost">
          Voltar
        </Link>
      </section>
    );
  }

  function patchCred(key: string, value: string) {
    setCreds((current) => ({ ...current, [key]: value }));
  }

  function saveCreds() {
    setError('');
    setMessage('');
    const result = saveChannelCredentials(channelId!, creds);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage('Credenciais salvas.');
    setTick((value) => value + 1);
  }

  function connect() {
    setError('');
    setMessage('');
    const saved = saveChannelCredentials(channelId!, creds);
    if (!saved.ok) {
      setError(saved.error);
      return;
    }
    const result = connectEcommerceChannel(channelId!, creds);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage(`${CHANNEL_LABEL[channelId!]} conectado.`);
    setTick((value) => value + 1);
  }

  function disconnect() {
    disconnectEcommerceChannel(channelId!);
    setMessage('Canal desconectado (credenciais mantidas).');
    setTick((value) => value + 1);
  }

  function sync() {
    const result = syncEcommerceChannel(channelId!);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage(result.channel.message);
    setTick((value) => value + 1);
  }

  const connected = channel.status === 'connected';

  return (
    <section className="admin-page ecommerce-channel">
      <article className="admin-card">
        <div className="admin-toolbar" style={{ marginBottom: 8 }}>
          <span className={`ecommerce-channel__status ${connected ? 'is-ok' : 'is-wait'}`}>
            {connected ? 'Conectado' : 'Desconectado'}
          </span>
          <em style={{ fontStyle: 'normal', color: 'var(--mute)', fontSize: '0.85rem' }}>
            {channel.kind === 'hub' ? 'Hub' : 'Marketplace'}
          </em>
        </div>
        <p className="fiscal-config__lead" style={{ margin: 0 }}>
          {channel.blurb}
        </p>
        <p className="empty" style={{ marginTop: 10 }}>
          {CHANNEL_CONNECT_GUIDE[channelId]}
        </p>
        <p className="empty" style={{ marginTop: 6 }}>
          {channel.message}
          {channel.lastSyncAt
            ? ` · Última sync ${new Date(channel.lastSyncAt).toLocaleString('pt-BR')}`
            : ''}
        </p>
        {message ? <p className="empty">{message}</p> : null}
        {error ? <p className="qty-low">{error}</p> : null}
      </article>

      <article className="admin-card">
        <h2>Configuração e conexão — {CHANNEL_LABEL[channelId]}</h2>
        <p className="empty" style={{ marginTop: 0 }}>
          Preencha os campos exigidos pela API. Secrets ficam só no navegador (MVP); em produção vão
          para o Nest / cofre.
        </p>
        <div className="admin-toolbar">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setShowSecrets((value) => !value)}
          >
            {showSecrets ? 'Ocultar secrets' : 'Mostrar secrets'}
          </button>
        </div>
        <div className="admin-form" style={{ marginTop: 12 }}>
          {fields.map((field) => (
            <label key={field.key} className={field.hint ? 'span-2' : undefined}>
              {field.label}
              {field.required ? ' *' : ''}
              <input
                type={field.secret && !showSecrets ? 'password' : 'text'}
                value={creds[field.key] ?? ''}
                onChange={(e) => patchCred(field.key, e.target.value)}
                placeholder={field.placeholder}
                autoComplete="off"
              />
              {field.hint ? (
                <span className="empty" style={{ marginTop: 4, display: 'block' }}>
                  {field.hint}
                </span>
              ) : null}
            </label>
          ))}
        </div>
        <div className="admin-toolbar" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn--ghost" onClick={saveCreds}>
            Salvar credenciais
          </button>
          {!connected ? (
            <button type="button" className="btn btn--primary" onClick={connect}>
              Conectar
            </button>
          ) : (
            <>
              <button type="button" className="btn btn--primary" onClick={sync}>
                Sincronizar com estoque
              </button>
              <button type="button" className="btn btn--ghost" onClick={disconnect}>
                Desconectar
              </button>
            </>
          )}
          <Link to="/ecommerce/anuncios" className="btn btn--ghost">
            Anúncios
          </Link>
          <Link to="/painel/produtos" className="btn btn--ghost">
            Estoque
          </Link>
        </div>
      </article>

      <article className="admin-card">
        <h2>Anúncios neste canal ({listings.length})</h2>
        {listings.length === 0 ? (
          <p className="empty">
            Nenhum anúncio. Publique a partir de{' '}
            <Link to="/ecommerce/anuncios">Anúncios</Link> (produto do estoque com imagem).
          </p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Foto</th>
                <th>Título</th>
                <th>SKU</th>
                <th>Qtd</th>
                <th>Preço</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.images[0] ? (
                      <img
                        src={item.images[0]}
                        alt=""
                        width={40}
                        height={40}
                        style={{ objectFit: 'cover', borderRadius: 8 }}
                      />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{item.title}</td>
                  <td>{item.sku}</td>
                  <td>{item.qty}</td>
                  <td>
                    {item.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                  <td>{item.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>

      <article className="admin-card">
        <h2>Pedidos recentes — {CHANNEL_LABEL[channelId]}</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Externo</th>
              <th>Cliente</th>
              <th>Valor</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty">
                  Nenhum pedido neste canal.
                </td>
              </tr>
            ) : (
              orders.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>{item.externalId.replace(/\|stocked$/, '')}</td>
                  <td>{item.customerName}</td>
                  <td>
                    {item.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                  <td>{ORDER_STATUS_LABEL[item.status]}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </article>
    </section>
  );
}
