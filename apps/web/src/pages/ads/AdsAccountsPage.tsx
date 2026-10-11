import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import { adsApi, type AdsAssets, type AdsHealth } from '../../services/adsApi';
import { AdsPage, dateTime, useAdsStatus } from './AdsShared';

const ACTION_LABEL: Record<string, string> = {
  'meta.connect_started': 'Iniciou a conexão com a Meta',
  'meta.connected': 'Conectou a conta Meta',
  'meta.connect_denied': 'Conexão cancelada na Meta',
  'meta.assets_selected': 'Escolheu Página e conta de anúncios',
  'meta.disconnected': 'Desconectou a conta Meta',
  'meta.data_deletion': 'Exclusão de dados pedida no Facebook',
  'campaign.draft_created': 'Criou rascunho',
  'campaign.edited': 'Editou campanha',
  'campaign.submit_started': 'Iniciou envio',
  'campaign.submitted': 'Enviou para a Meta (pausada)',
  'campaign.submit_failed': 'Falha no envio',
  'campaign.activated': 'Autorizou orçamento e ativou',
  'campaign.paused': 'Pausou',
  'campaign.creative_resubmitted': 'Corrigiu e reenviou o anúncio',
  'campaign.draft_deleted': 'Excluiu rascunho',
  'media.video_uploaded': 'Enviou vídeo',
};

/** Conexão oficial com a Meta: login no Facebook (o Marthi nunca pede a senha), Página e conta de anúncios. */
export function AdsAccountsPage() {
  const { status, error: statusError, reload } = useAdsStatus();
  const [params, setParams] = useSearchParams();
  const [health, setHealth] = useState<AdsHealth | null>(null);
  const [assets, setAssets] = useState<AdsAssets | null>(null);
  const [pageId, setPageId] = useState('');
  const [adAccountId, setAdAccountId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [audit, setAudit] = useState<Awaited<ReturnType<typeof adsApi.audit>>>([]);

  const outcome = params.get('meta');
  useEffect(() => {
    if (!outcome) return;
    if (outcome === 'ok') setMessage('Conta Meta conectada. Agora escolha a Página e a conta de anúncios.');
    else setError(params.get('motivo') || 'A conexão não foi concluída.');
    setParams({}, { replace: true });
  }, [outcome]);

  const connected = status?.connection && status.connection.status !== 'revoked';
  const loadHealth = () =>
    adsApi
      .health()
      .then(setHealth)
      .catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível conferir a conexão.'));
  useEffect(() => {
    if (!status) return;
    void loadHealth();
    if (status.canAdmin) adsApi.audit().then(setAudit).catch(() => undefined);
    if (status.canAdmin && status.connection && status.connection.status === 'connected') {
      adsApi
        .assets()
        .then((data) => {
          setAssets(data);
          setPageId(status.connection?.page?.id ?? '');
          setAdAccountId(status.connection?.adAccount?.id ?? '');
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível listar as Páginas e contas.'));
    }
  }, [status]);

  async function connect() {
    setBusy(true);
    setError('');
    try {
      const { url } = await adsApi.connect();
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível iniciar a conexão.');
      setBusy(false);
    }
  }

  async function saveAssets() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      setHealth(await adsApi.selectAssets({ pageId, adAccountId }));
      setMessage('Página e conta de anúncios salvas.');
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm('Desconectar a conta Meta? Campanhas já criadas continuam na Meta; o Marthi deixa de acompanhar e de enviar novas.')) return;
    setBusy(true);
    try {
      await adsApi.disconnect();
      setHealth(null);
      setAssets(null);
      setMessage('Conta Meta desconectada e autorização removida.');
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível desconectar.');
    } finally {
      setBusy(false);
    }
  }

  const configOk = status ? status.config.appConfigured && status.config.vaultReady : false;
  return (
    <AdsPage title="Contas conectadas" lead="Conecte sua conta da Meta pelo login oficial do Facebook. O Marthi nunca pede a sua senha." status={status}>
      {statusError || error ? <p className="ads-error">{statusError || error}</p> : null}
      {message ? <p className="ads-ok">{message}</p> : null}

      <div className="ads-grid">
        <article className="admin-card">
          <h2 className="ads-card-title">Meta (Facebook e Instagram)</h2>
          {!status ? (
            <p className="empty">Carregando…</p>
          ) : !configOk ? (
            <>
              <p className="empty">
                O botão de conexão é liberado assim que o Marthi ativar o app oficial da Meta neste servidor. Enquanto isso, deixe pronto o que a
                conexão vai pedir:
              </p>
              <ul className="ads-checks">
                <li className="is-bad">
                  <span className="ads-checks__icon">1</span>
                  <div>
                    <strong>Conta do Facebook administradora da Página da loja</strong>
                    <small>Quem conecta precisa ser administrador da Página (Configurações da Página › Acesso à Página).</small>
                  </div>
                </li>
                <li className="is-bad">
                  <span className="ads-checks__icon">2</span>
                  <div>
                    <strong>Conta de anúncios no Gerenciador de Anúncios</strong>
                    <small>Em business.facebook.com › Contas de anúncios, com a Página vinculada.</small>
                  </div>
                </li>
                <li className="is-bad">
                  <span className="ads-checks__icon">3</span>
                  <div>
                    <strong>Forma de pagamento cadastrada na conta de anúncios</strong>
                    <small>A cobrança dos anúncios é feita pela Meta, no cartão da loja.</small>
                  </div>
                </li>
              </ul>
              <button type="button" className="btn btn--primary" disabled title="Aguardando o Marthi ativar o app da Meta neste servidor">
                Conectar com a Meta
              </button>
            </>
          ) : connected ? (
            <>
              <p>
                Conectada por <strong>{status.connection?.userName || 'conta Meta'}</strong>
                {status.connection?.expiresAt ? ` · autorização até ${new Date(status.connection.expiresAt).toLocaleDateString('pt-BR')}` : ''}
              </p>
              {status.connection?.status === 'needs_reconnect' ? <p className="ads-error">A autorização expirou ou foi removida. Conecte de novo.</p> : null}
              {status.canAdmin ? (
                <div className="ads-actions">
                  <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void connect()}>
                    Conectar de novo
                  </button>
                  <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void disconnect()}>
                    Desconectar
                  </button>
                </div>
              ) : null}
            </>
          ) : status.canAdmin ? (
            <>
              <p className="empty">Você vai entrar no Facebook, escolher a Página e a conta de anúncios e autorizar só o necessário para anunciar.</p>
              <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void connect()}>
                Conectar com a Meta
              </button>
            </>
          ) : (
            <p className="empty">Só o administrador da loja pode conectar a conta Meta.</p>
          )}
          <p className="ads-note">
            Permissões pedidas: {status?.config.scopes.join(', ') || '—'}. API da Meta {status?.config.apiVersion ?? ''}.
          </p>
        </article>

        {connected && status?.canAdmin && assets ? (
          <article className="admin-card">
            <h2 className="ads-card-title">Página e conta de anúncios</h2>
            <div className="ads-form">
              <AdminPicker
                label="Página do Facebook (autora do anúncio)"
                value={pageId}
                placeholder="Escolha a Página"
                options={assets.pages.map((page) => ({ value: page.id, label: `${page.name}${page.canAdvertise ? '' : ' — sem permissão de anunciar'}${page.instagram ? ` · @${page.instagram.username}` : ''}`, disabled: !page.canAdvertise }))}
                onChange={setPageId}
              />
              <AdminPicker
                label="Conta de anúncios (quem paga a Meta)"
                value={adAccountId}
                placeholder="Escolha a conta"
                options={assets.adAccounts.map((account) => ({ value: account.id, label: `${account.name} · ${account.currency} · ${account.statusLabel}` }))}
                onChange={setAdAccountId}
              />
            </div>
            {!assets.pages.length ? <p className="ads-note">Nenhuma Página autorizada. Conecte de novo e marque a Página da loja.</p> : null}
            {!assets.adAccounts.length ? <p className="ads-note">Nenhuma conta de anúncios autorizada. Crie uma no Gerenciador de Anúncios da Meta e conecte de novo.</p> : null}
            <div className="ads-actions">
              <span />
              <button type="button" className="btn btn--primary" disabled={busy || !pageId || !adAccountId} onClick={() => void saveAssets()}>
                Salvar escolha
              </button>
            </div>
          </article>
        ) : null}
      </div>

      {health ? (
        <article className="admin-card">
          <h2 className="ads-card-title">{health.canAdvertise ? 'Tudo pronto para anunciar no Facebook' : 'O que falta para anunciar'}</h2>
          <ul className="ads-checks">
            {health.checks.map((check) => (
              <li key={check.id} className={check.ok ? 'is-ok' : 'is-bad'}>
                <span className="ads-checks__icon">{check.ok ? '✓' : '!'}</span>
                <span>
                  <strong>{check.title}</strong>
                  {check.help ? <small>{check.help}</small> : null}
                </span>
              </li>
            ))}
          </ul>
          <p className="ads-note">Última conferência: {dateTime(health.connection?.lastCheckedAt)}</p>
        </article>
      ) : null}

      {status?.canAdmin && audit.length ? (
        <article className="admin-card">
          <h2 className="ads-card-title">Histórico (auditoria)</h2>
          <div className="ads-table-wrap">
            <table className="admin-table ads-table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Quem</th>
                  <th>O quê</th>
                </tr>
              </thead>
              <tbody>
                {audit.slice(0, 30).map((row, index) => (
                  <tr key={index}>
                    <td>{dateTime(row.created_at)}</td>
                    <td>{row.actor}</td>
                    <td>{ACTION_LABEL[row.action] ?? row.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}
    </AdsPage>
  );
}
