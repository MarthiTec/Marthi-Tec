import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adsApi, type AdsHealth, type AdsStoreTest } from '../services/adsApi';
import '../pages/ads/ads.css';

const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

/**
 * Conexão Meta da loja (Facebook e Instagram), como a Evolution: a loja informa o token do usuário de sistema
 * do Gerenciador de Negócios dela. O Marthi confere token, permissões, Página, Instagram e conta de anúncios
 * e guarda o token criptografado no servidor (nunca volta para a tela).
 */
export function MetaStoreConnectionSection() {
  const [health, setHealth] = useState<AdsHealth | null>(null);
  const [loadError, setLoadError] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [pageId, setPageId] = useState('');
  const [adAccountId, setAdAccountId] = useState('');
  const [busy, setBusy] = useState<'' | 'save' | 'test' | 'disconnect'>('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [test, setTest] = useState<AdsStoreTest | null>(null);
  const [options, setOptions] = useState<{ pages: Array<{ id: string; name: string; instagram: string }>; adAccounts: Array<{ id: string; name: string }> } | null>(null);

  const load = useCallback(() => {
    setLoadError('');
    adsApi
      .health()
      .then(setHealth)
      .catch((err) => setLoadError(message(err, 'Não foi possível consultar a conexão com a Meta.')));
  }, []);
  useEffect(load, [load]);

  const connection = health?.connection ?? null;
  const connected = Boolean(connection && connection.status === 'connected');

  async function save() {
    if (token.trim().length < 30) return setError('Cole o token de acesso completo gerado na Meta.');
    setBusy('save');
    setError('');
    setOk('');
    setTest(null);
    try {
      const result = await adsApi.storeConnect({ token: token.trim(), pageId: pageId.trim() || undefined, adAccountId: adAccountId.trim() || undefined });
      setHealth(result.health);
      setOptions({ pages: result.pages, adAccounts: result.adAccounts });
      setToken('');
      setOk('Conexão validada e salva. O token fica guardado criptografado no servidor.');
    } catch (err) {
      setError(message(err, 'Não foi possível validar o token.'));
    } finally {
      setBusy('');
    }
  }

  async function runTest() {
    setBusy('test');
    setError('');
    setOk('');
    try {
      setTest(await adsApi.storeTest());
    } catch (err) {
      setError(message(err, 'Não foi possível testar a conexão.'));
    } finally {
      setBusy('');
    }
  }

  async function disconnect() {
    if (!window.confirm('Desconectar a Meta desta loja? O token guardado é apagado; publicações agendadas não serão publicadas até conectar de novo.')) return;
    setBusy('disconnect');
    setError('');
    try {
      await adsApi.disconnect();
      setTest(null);
      setOptions(null);
      setOk('Conexão removida.');
      load();
    } catch (err) {
      setError(message(err, 'Não foi possível desconectar.'));
    } finally {
      setBusy('');
    }
  }

  return (
    <article className="admin-card meta-store">
      <header className="meta-store__head">
        <div>
          <h2>Meta (Facebook e Instagram)</h2>
          <p className="empty">
            Conexão da sua loja com a Meta, como a do WhatsApp: com ela o Marthi publica no seu Instagram (programado, sem custo) e, quando quiser, cria anúncios pagos na sua conta de anúncios.
          </p>
        </div>
        <span className={`ads-chip ${connected ? 'is-ok' : 'is-muted'}`}>{connected ? 'Conectada' : 'Não conectada'}</span>
      </header>

      {loadError ? <p className="ads-error">{loadError}</p> : null}

      {connection && connection.status !== 'revoked' ? (
        <div className="meta-store__current">
          <div>
            <small>Conectada como</small>
            <strong>{connection.userName || '—'}</strong>
            <small>{connection.mode === 'store_token' ? 'Token da loja' : 'Login pelo app do Marthi'}</small>
          </div>
          <div>
            <small>Página</small>
            <strong>{connection.page?.name || 'não escolhida'}</strong>
          </div>
          <div>
            <small>Instagram</small>
            <strong>{connection.instagram ? `@${connection.instagram.username}` : 'não vinculado'}</strong>
          </div>
          <div>
            <small>Conta de anúncios</small>
            <strong>{connection.adAccount?.name || 'não liberada'}</strong>
          </div>
        </div>
      ) : null}

      {health ? (
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
      ) : null}

      {/* Campos no padrão do sistema. O token não é campo de senha: assim o navegador não preenche sozinho
          (nem coloca o e-mail no ID da Página); ele fica mascarado até clicar em Mostrar. */}
      <div className="admin-form meta-store__form" role="group" aria-label="Dados da conexão Meta">
        <label className="span-2">
          {connected ? 'Trocar o token de acesso' : 'Token de acesso da loja *'}
          <div className="meta-store__token-row">
            <input
              type="text"
              name="marthi-meta-store-token"
              className={showToken ? '' : 'meta-store__masked'}
              value={token}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              placeholder="Cole aqui o token gerado no Gerenciador de Negócios (começa com EAA…)"
              onChange={(e) => setToken(e.target.value)}
            />
            <button type="button" className="btn btn--ghost" onClick={() => setShowToken((value) => !value)}>
              {showToken ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
        </label>
        <label>
          ID da Página (opcional)
          <input
            type="text"
            name="marthi-meta-page-id"
            value={pageId}
            inputMode="numeric"
            autoComplete="off"
            data-lpignore="true"
            data-1p-ignore="true"
            placeholder="Só se o token tiver mais de uma Página"
            onChange={(e) => setPageId(e.target.value.replace(/[^\d]/g, ''))}
          />
        </label>
        <label>
          ID da conta de anúncios (opcional)
          <input
            type="text"
            name="marthi-meta-ad-account"
            value={adAccountId}
            autoComplete="off"
            data-lpignore="true"
            data-1p-ignore="true"
            placeholder="act_… — só para anúncio pago"
            onChange={(e) => setAdAccountId(e.target.value.trim())}
          />
        </label>
      </div>

      {options && (options.pages.length > 1 || options.adAccounts.length > 1) ? (
        <p className="ads-note">
          O token tem acesso a {options.pages.length} Página(s) e {options.adAccounts.length} conta(s) de anúncios. Para escolher uma específica, informe o ID e valide de novo:{' '}
          {options.pages.map((page) => `${page.name} (${page.id})`).join(', ')}
          {options.adAccounts.length ? ` · ${options.adAccounts.map((account) => `${account.name} (${account.id})`).join(', ')}` : ''}
        </p>
      ) : null}

      {error ? <p className="ads-error">{error}</p> : null}
      {ok ? <p className="ads-ok">{ok}</p> : null}

      <div className="meta-store__actions">
        <button type="button" className="btn btn--primary" disabled={Boolean(busy) || !token.trim()} onClick={() => void save()}>
          {busy === 'save' ? 'Validando…' : 'Validar e salvar'}
        </button>
        <button type="button" className="btn btn--ghost" disabled={Boolean(busy) || !connected} onClick={() => void runTest()}>
          {busy === 'test' ? 'Testando…' : 'Testar conexão'}
        </button>
        {connection && connection.status !== 'revoked' ? (
          <button type="button" className="btn btn--ghost" disabled={Boolean(busy)} onClick={() => void disconnect()}>
            Desconectar
          </button>
        ) : null}
      </div>

      {test ? (
        <div className="meta-store__test">
          <h3>Resultado do teste</h3>
          <ul className="ads-checks">
            <li className={test.canPublishInstagram ? 'is-ok' : 'is-bad'}>
              <span className="ads-checks__icon">{test.canPublishInstagram ? '✓' : '!'}</span>
              <span>
                <strong>
                  Publicar no Instagram
                  {test.instagram ? ` · @${test.instagram.username}${test.instagram.followers != null ? ` · ${test.instagram.followers.toLocaleString('pt-BR')} seguidores` : ''}${test.instagram.mediaCount != null ? ` · ${test.instagram.mediaCount} publicações` : ''}` : ''}
                </strong>
                <small>{test.canPublishInstagram ? 'Pronto: agende em Anúncios Ads › Publicações e calendário.' : test.instagramHelp}</small>
              </span>
            </li>
            <li className={test.canAdvertise ? 'is-ok' : 'is-bad'}>
              <span className="ads-checks__icon">{test.canAdvertise ? '✓' : '○'}</span>
              <span>
                <strong>Anúncio pago (opcional)</strong>
                <small>{test.canAdvertise ? 'Pronto: crie em Anúncios Ads › Criar anúncio. A Meta cobra na sua conta de anúncios.' : test.adsHelp}</small>
              </span>
            </li>
          </ul>
          <p className="ads-note">Permissões do token: {test.granted.join(', ') || '—'}.</p>
        </div>
      ) : null}

      <details className="meta-store__guide">
        <summary>Como gerar o token da loja (uma vez)</summary>
        <ol>
          <li>
            O Instagram da loja precisa ser <strong>profissional</strong> (Empresa ou Criador) e estar <strong>vinculado à Página</strong> do Facebook: no app do Instagram, Configurações › Conta › Contas
            conectadas › Facebook.
          </li>
          <li>
            Em <strong>business.facebook.com</strong> › Configurações do negócio: confira se a Página, o Instagram e (para anúncio pago) a conta de anúncios estão no seu Gerenciador de Negócios.
          </li>
          <li>
            Em <strong>developers.facebook.com</strong> › Meus apps › Criar app › tipo <strong>Empresa</strong>, ligado ao seu Gerenciador de Negócios (é gratuito e fica só com você).
          </li>
          <li>
            De volta às Configurações do negócio › Usuários › <strong>Usuários do sistema</strong> › Adicionar (função Administrador). Em <strong>Atribuir ativos</strong>, dê controle total da Página, do
            Instagram e da conta de anúncios.
          </li>
          <li>
            Clique em <strong>Gerar novo token</strong>, escolha o app criado, validade <strong>Nunca expira</strong> e marque as permissões:
            <code>instagram_basic</code>, <code>instagram_content_publish</code>, <code>pages_show_list</code>, <code>pages_read_engagement</code> (publicar no Instagram) e, se for anunciar,
            <code>ads_management</code>, <code>ads_read</code>, <code>pages_manage_ads</code>.
          </li>
          <li>Copie o token, cole acima e clique em <strong>Validar e salvar</strong>. Depois, <strong>Testar conexão</strong>.</li>
        </ol>
        <p className="ads-note">
          O token dá acesso à sua Página: não envie por WhatsApp nem e-mail. Se ele vazar, gere outro no mesmo lugar (o antigo deixa de funcionar) e salve aqui de novo.
        </p>
      </details>

      <p className="ads-note">
        Depois de conectar: <Link to="/painel/ads/publicacoes">Publicações e calendário</Link> (Instagram, sem custo) · <Link to="/painel/ads/criar">Criar anúncio</Link> (pago).
      </p>
    </article>
  );
}
