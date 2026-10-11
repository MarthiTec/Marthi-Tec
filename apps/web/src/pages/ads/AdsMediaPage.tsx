import { useEffect, useState, type ChangeEvent } from 'react';
import { adsApi, type AdsMedia } from '../../services/adsApi';
import { AdsPage, dateTime, useAdsStatus } from './AdsShared';

const IMAGE_MAX = 30 * 1024 * 1024;
const VIDEO_MAX = 100 * 1024 * 1024;
const STATUS_LABEL: Record<string, string> = { ready: 'Pronto', processing: 'Processando na Meta', error: 'Recusado pela Meta' };

const readDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });

/** Biblioteca de mídias para anúncios: fotos ficam no Marthi; vídeos vão direto para a conta de anúncios. */
export function AdsMediaPage() {
  const { status } = useAdsStatus();
  const [items, setItems] = useState<AdsMedia[]>([]);
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = () => adsApi.media().then(setItems).catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível carregar.'));
  useEffect(() => {
    void load();
  }, []);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setNotice('');
    if (!rights) return setError('Confirme que você tem direito de usar esta mídia.');
    setBusy(true);
    try {
      if (file.type.startsWith('image/')) {
        if (!['image/jpeg', 'image/png'].includes(file.type)) throw new Error('Use imagem JPG ou PNG.');
        if (file.size > IMAGE_MAX) throw new Error('A imagem passa de 30 MB.');
        const saved = await adsApi.uploadImage({ name: file.name, dataUrl: await readDataUrl(file), rightsConfirmed: true });
        setNotice(saved.warnings?.length ? `Foto salva. Atenção: ${saved.warnings.map((w) => w.message).join(' ')}` : 'Foto salva.');
      } else if (file.type.startsWith('video/')) {
        if (!['video/mp4', 'video/quicktime'].includes(file.type)) throw new Error('Use vídeo MP4 ou MOV.');
        if (file.size > VIDEO_MAX) throw new Error('O vídeo passa de 100 MB (limite do envio pelo Marthi).');
        await adsApi.uploadVideo(file);
        setNotice('Vídeo enviado para a sua conta de anúncios. A Meta processa em alguns minutos — use "Atualizar" para conferir.');
      } else throw new Error('Envie uma foto (JPG/PNG) ou um vídeo (MP4/MOV).');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar.');
    } finally {
      setBusy(false);
    }
  }

  async function refresh(item: AdsMedia) {
    setBusy(true);
    try {
      await adsApi.refreshMedia(item.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: AdsMedia) {
    if (!window.confirm(`Apagar "${item.name}" da biblioteca?`)) return;
    try {
      await adsApi.deleteMedia(item.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível apagar.');
    }
  }

  const videoReady = Boolean(status?.connection?.adAccount);
  return (
    <AdsPage title="Fotos e vídeos" lead="Fotos e vídeos para os seus anúncios. As fotos do cadastro do produto também podem ser usadas direto no anúncio." status={status}>
      {error ? <p className="ads-error">{error}</p> : null}
      {notice ? <p className="ads-ok">{notice}</p> : null}
      <article className="admin-card">
        <h2 className="ads-card-title">Enviar</h2>
        <label className="ads-check">
          <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} />
          Tenho o direito de usar esta mídia em anúncios (foto/vídeo próprio ou com autorização; sem marcas, músicas ou pessoas sem permissão).
        </label>
        <div className="ads-actions">
          <label className="btn btn--primary" style={{ cursor: busy ? 'default' : 'pointer' }}>
            <input type="file" accept="image/jpeg,image/png,video/mp4,video/quicktime" hidden disabled={busy} onChange={(e) => void upload(e)} />
            {busy ? 'Enviando…' : 'Escolher foto ou vídeo'}
          </label>
          {!videoReady ? <span className="ads-note">Vídeos precisam da conta de anúncios escolhida em Contas conectadas.</span> : null}
        </div>
        <p className="ads-note">
          Regras do Feed do Facebook: foto JPG/PNG até 30 MB, largura mínima 600 px, entre 1,91:1 (deitada) e 4:5 (em pé) — de preferência 1:1 ou 4:5 com 1080 px ou mais. Vídeo MP4/MOV de 1 s a 240 min (o
          Marthi envia até 100 MB). As conferências ajudam a evitar recusas, mas quem aprova é a Meta.
        </p>
      </article>
      <article className="admin-card">
        <h2 className="ads-card-title">Biblioteca</h2>
        <div className="ads-media-grid">
          {items.map((item) => (
            <div key={item.id} className="ads-media-item" style={{ cursor: 'default' }}>
              {item.preview ? <img src={item.preview} alt="" /> : <span className="ads-media-ph">{item.kind === 'video' ? 'Vídeo' : 'Sem prévia'}</span>}
              <small>
                {item.name}
                <br />
                {item.kind === 'image' ? `${item.width}×${item.height}px` : `${STATUS_LABEL[item.status] ?? item.status}${item.durationSec ? ` · ${Math.round(item.durationSec)}s` : ''}`}
                <br />
                {dateTime(item.createdAt)}
              </small>
              <span style={{ display: 'flex', gap: 6 }}>
                {item.kind === 'video' && item.status !== 'ready' ? (
                  <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => void refresh(item)}>
                    Atualizar
                  </button>
                ) : null}
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => void remove(item)}>
                  Apagar
                </button>
              </span>
            </div>
          ))}
          {!items.length ? <p className="empty">Nenhuma mídia enviada ainda.</p> : null}
        </div>
      </article>
    </AdsPage>
  );
}
