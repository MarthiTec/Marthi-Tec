import { Link } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { adsApi, type AdsMedia, type SocialPost } from '../../services/adsApi';
import { AdsPage, PhaseBlocked, dateTime, useAdsStatus } from './AdsShared';

/** Créditos e pagamentos: hoje a Meta cobra direto o lojista; créditos do Marthi dependem da Fase 2. */
export function AdsCreditsPage() {
  const { status } = useAdsStatus();
  const account = status?.connection?.adAccount;
  return (
    <AdsPage title="Créditos e pagamentos" lead="Quem paga o quê nos seus anúncios." status={status}>
      <article className="admin-card">
        <h2 className="ads-card-title">Como funciona hoje</h2>
        <ul className="ads-checks">
          <li className="is-ok">
            <span className="ads-checks__icon">✓</span>
            <span>
              <strong>A Meta cobra você diretamente</strong>
              <small>
                Os anúncios rodam na sua conta de anúncios{account ? ` (${account.name}, ${account.currency})` : ''} e a Meta cobra pela forma de pagamento cadastrada nela. Gastos, faturas e recibos ficam
                no Gerenciador de Anúncios da Meta, em Cobrança e pagamentos.
              </small>
            </span>
          </li>
          <li className="is-ok">
            <span className="ads-checks__icon">✓</span>
            <span>
              <strong>Você controla o limite</strong>
              <small>Cada anúncio só gasta depois que o administrador autoriza o orçamento (por dia ou total). Pausar a campanha interrompe a veiculação.</small>
            </span>
          </li>
          <li>
            <span className="ads-checks__icon">○</span>
            <span>
              <strong>O Marthi não guarda saldo de mídia</strong>
              <small>Nenhum valor pago ao Marthi vira crédito na Meta. Por isso esta tela não mostra saldo.</small>
            </span>
          </li>
        </ul>
      </article>
      <PhaseBlocked phase="Fase 2" title="Créditos do Marthi">
        <p>Pagar anúncios pelo Marthi (com saldo, reservas e devoluções) está bloqueado até:</p>
        <ul>
          <li>definir o provedor de pagamento (hoje não há um integrado ao sistema);</li>
          <li>confirmar com a Meta e com o jurídico o modelo — não existe forma oficial de transferir saldo do Marthi para a conta de anúncios de cada loja;</li>
          <li>definir as regras de pagamento pendente, falha, reprovação, cancelamento, estorno e saldo não usado.</li>
        </ul>
        <p>Enquanto isso, nada aqui cobra você. Os gastos reais estão sempre no Gerenciador de Anúncios.</p>
      </PhaseBlocked>
    </AdsPage>
  );
}

/** Publicações no Instagram (orgânicas, sem custo): foto + legenda, agora ou agendada. */
export function AdsPostsPage() {
  const { status } = useAdsStatus();
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [media, setMedia] = useState<AdsMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [mediaId, setMediaId] = useState('');
  const [caption, setCaption] = useState('');
  const [mode, setMode] = useState<'now' | 'schedule'>('schedule');
  const [when, setWhen] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setListError('');
    Promise.all([adsApi.socialPosts(), adsApi.media()])
      .then(([list, files]) => {
        setPosts(list);
        setMedia(files.filter((file) => file.kind === 'image'));
      })
      .catch((err) => setListError(err instanceof Error ? err.message : 'Não foi possível carregar as publicações.'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const instagram = status?.connection?.instagram;
  const jpgs = media.filter((file) => file.mime === 'image/jpeg');
  const hashtags = (caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
  const preview = (id: string | null) => media.find((file) => file.id === id)?.preview ?? null;

  async function submit() {
    if (!mediaId) return setError('Escolha a foto.');
    if (mode === 'schedule' && !when) return setError('Escolha a data e a hora.');
    setBusy('create');
    setError('');
    setOk('');
    try {
      const created = await adsApi.createSocialPost({ caption, mediaId, scheduledAt: mode === 'schedule' ? new Date(when).toISOString() : null });
      setOk(
        created.status === 'published'
          ? 'Publicado no Instagram.'
          : created.status === 'failed'
            ? `A Meta recusou: ${created.error}`
            : `Agendado para ${dateTime(created.scheduledAt)}. O Marthi publica sozinho no horário.`,
      );
      if (created.status !== 'failed') {
        setCaption('');
        setMediaId('');
      }
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar a publicação.');
    } finally {
      setBusy('');
    }
  }

  async function act(post: SocialPost, action: 'cancel' | 'retry') {
    setBusy(post.id);
    setError('');
    try {
      if (action === 'cancel') await adsApi.cancelSocialPost(post.id);
      else await adsApi.retrySocialPost(post.id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar a publicação.');
    } finally {
      setBusy('');
    }
  }

  const STATUS: Record<SocialPost['status'], { label: string; tone: string }> = {
    scheduled: { label: 'Agendada', tone: 'is-info' },
    publishing: { label: 'Publicando', tone: 'is-warn' },
    published: { label: 'Publicada', tone: 'is-ok' },
    failed: { label: 'Falhou', tone: 'is-bad' },
    cancelled: { label: 'Cancelada', tone: 'is-muted' },
  };

  return (
    <AdsPage title="Publicações e calendário" lead="Publique no Instagram da loja sem pagar anúncio: na hora ou agendado." status={status}>
      {!instagram ? (
        <article className="admin-card">
          <p className="ads-error">Nenhum Instagram profissional conectado a esta loja.</p>
          <p className="ads-note">
            Conecte a Meta da loja em <Link to="/painel/operacoes?tab=meta">Operações › Meta (Facebook &amp; Instagram)</Link> e confira se o Instagram é profissional e está vinculado à Página.
          </p>
        </article>
      ) : (
        <article className="admin-card">
          <h2 className="ads-card-title">Nova publicação · @{instagram.username}</h2>
          <div className="ig-posts__form">
            <div>
              <span className="ads-field-label">Foto (JPG, de 4:5 em pé a 1,91:1 deitada)</span>
              {jpgs.length ? (
                <div className="ads-media-grid">
                  {jpgs.map((file) => (
                    <button key={file.id} type="button" className={`ads-media-item${mediaId === file.id ? ' is-selected' : ''}`} onClick={() => setMediaId(file.id)}>
                      {file.preview ? <img src={file.preview} alt={file.name} /> : <span className="ads-media-ph">Foto</span>}
                      <small>{file.name}</small>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="ads-note">
                  Nenhuma foto JPG na biblioteca. Envie em <Link to="/painel/ads/midias">Fotos e vídeos</Link> (o Instagram não aceita PNG).
                </p>
              )}
            </div>
            <div className="ads-form-stack">
              <label>
                <span className="ads-field-label">Legenda</span>
                <textarea value={caption} maxLength={2200} placeholder="Ex.: iPhone 15 Pro Max seminovo com 3 meses de garantia. Chame no direct! #iphone #seminovo" onChange={(e) => setCaption(e.target.value)} />
              </label>
              <span className="ig-posts__counter">
                {caption.length}/2200 · {hashtags}/30 hashtags
              </span>
              <div className="ig-posts__when" role="radiogroup" aria-label="Quando publicar">
                <label>
                  <input type="radio" checked={mode === 'schedule'} onChange={() => setMode('schedule')} /> Agendar
                </label>
                {mode === 'schedule' ? <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /> : null}
                <label>
                  <input type="radio" checked={mode === 'now'} onChange={() => setMode('now')} /> Publicar agora
                </label>
              </div>
              {error ? <p className="ads-error">{error}</p> : null}
              {ok ? <p className="ads-ok">{ok}</p> : null}
              <div className="ads-actions">
                <button type="button" className="btn btn--primary" disabled={Boolean(busy) || !mediaId} onClick={() => void submit()}>
                  {busy === 'create' ? 'Enviando…' : mode === 'now' ? 'Publicar agora' : 'Agendar publicação'}
                </button>
              </div>
              <p className="ads-note">Publicação é gratuita. Para impulsionar com dinheiro, use Criar anúncio (pago, na sua conta de anúncios) ou o botão Turbinar no próprio app do Instagram.</p>
            </div>
          </div>
        </article>
      )}

      <article className="admin-card">
        <h2 className="ads-card-title">Calendário</h2>
        {listError ? <p className="ads-error">{listError}</p> : null}
        {loading ? <p className="empty">Carregando…</p> : null}
        {!loading && !posts.length ? <p className="empty">Nenhuma publicação ainda.</p> : null}
        <ul className="ig-posts__list">
          {posts.map((post) => {
            const thumb = preview(post.mediaId);
            return (
              <li key={post.id} className="ig-posts__item">
                {thumb ? <img src={thumb} alt="" /> : <span className="ig-posts__thumb" />}
                <div>
                  <span className={`ads-chip ${STATUS[post.status].tone}`}>{STATUS[post.status].label}</span>{' '}
                  <small>
                    {post.status === 'published' ? `publicada em ${dateTime(post.publishedAt)}` : `${post.status === 'scheduled' ? 'para' : 'agendada para'} ${dateTime(post.scheduledAt)}`} · por {post.createdBy || '—'}
                  </small>
                  <p>{post.caption || <em>Sem legenda</em>}</p>
                  {post.error && post.status !== 'published' ? <small className="ads-error-text">{post.error}</small> : null}
                </div>
                <div className="ig-posts__actions">
                  {post.permalink ? (
                    <a className="btn btn--ghost btn--sm" href={post.permalink} target="_blank" rel="noreferrer">
                      Ver no Instagram
                    </a>
                  ) : null}
                  {post.status === 'failed' ? (
                    <button type="button" className="btn btn--ghost btn--sm" disabled={busy === post.id} onClick={() => void act(post, 'retry')}>
                      Tentar de novo
                    </button>
                  ) : null}
                  {post.status === 'scheduled' || post.status === 'failed' ? (
                    <button type="button" className="btn btn--ghost btn--sm" disabled={busy === post.id} onClick={() => void act(post, 'cancel')}>
                      Cancelar
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </article>
    </AdsPage>
  );
}
