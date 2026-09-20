import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  CRM_EVENT,
  ensureCrmSellerProfile,
  saveCrmSellerProfile,
  type CrmSellerProfile,
} from '../../data/crmStore';

type SellerCtx = { sellerId: string; sellerName: string };

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'M';
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

function WebcamCapture({
  title,
  onCapture,
  onClose,
}: {
  title: string;
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError('Este navegador não permite webcam.');
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setError('Não foi possível abrir a webcam. Verifique a permissão do navegador.');
      }
    }
    void start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  function snap() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setError('Aguarde a câmera carregar.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    onCapture(canvas.toDataURL('image/jpeg', 0.9));
    onClose();
  }

  return (
    <div className="crm-cam" role="dialog" aria-modal="true" aria-label={title}>
      <div className="crm-cam__card">
        <header>
          <h3>{title}</h3>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Fechar
          </button>
        </header>
        {error ? <p className="crm-profile__err">{error}</p> : null}
        <video ref={videoRef} playsInline muted className="crm-cam__video" />
        <div className="crm-cam__actions">
          <button type="button" className="btn btn--primary" onClick={snap} disabled={Boolean(error)}>
            Tirar foto
          </button>
        </div>
      </div>
    </div>
  );
}

export function CrmProfilePage() {
  const me = useOutletContext<SellerCtx>();
  const [tick, setTick] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [camTarget, setCamTarget] = useState<'avatar' | 'cover' | null>(null);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement | null>(null);
  const coverFileRef = useRef<HTMLInputElement | null>(null);
  const avatarWrapRef = useRef<HTMLDivElement | null>(null);
  const profile = useMemo(
    () => ensureCrmSellerProfile(me.sellerId, me.sellerName),
    [me.sellerId, me.sellerName, tick],
  );
  const [form, setForm] = useState<CrmSellerProfile>(profile);

  useEffect(() => {
    setForm(ensureCrmSellerProfile(me.sellerId, me.sellerName));
    setDirty(false);
  }, [me.sellerId, me.sellerName, tick]);

  useEffect(() => {
    function refresh() {
      setTick((value) => value + 1);
    }
    window.addEventListener(CRM_EVENT, refresh);
    return () => window.removeEventListener(CRM_EVENT, refresh);
  }, []);

  useEffect(() => {
    if (!avatarMenuOpen) return;
    function onDoc(event: MouseEvent) {
      if (!avatarWrapRef.current?.contains(event.target as Node)) {
        setAvatarMenuOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setAvatarMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [avatarMenuOpen]);

  function patch<K extends keyof CrmSellerProfile>(key: K, value: CrmSellerProfile[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setMessage('');
  }

  async function onPickFile(kind: 'avatar' | 'cover', file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Selecione um arquivo de imagem.');
      return;
    }
    if (file.size > 4_500_000) {
      setError('Imagem muito grande (máx. ~4,5 MB).');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      patch(kind === 'avatar' ? 'avatarUrl' : 'coverUrl', dataUrl);
      setError('');
    } catch {
      setError('Não foi possível carregar a imagem.');
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const result = saveCrmSellerProfile(form);
    if (!result.ok) {
      setError(result.error);
      setMessage('');
      return;
    }
    setError('');
    setDirty(false);
    setMessage('Perfil publicado na rede Marthi CRM.');
    setTick((value) => value + 1);
  }

  function reset() {
    setForm(ensureCrmSellerProfile(me.sellerId, me.sellerName));
    setDirty(false);
    setError('');
    setMessage('');
  }

  return (
    <section className="crm-profile">
      <p className="crm-profile__lead">
        Seu perfil público na rede Marthi — vendedores e clientes fechados veem quem atende.
      </p>

      {message ? <p className="crm-profile__ok">{message}</p> : null}
      {error ? <p className="crm-profile__err">{error}</p> : null}

      <article className="crm-profile__card">
        <div
          className="crm-profile__cover"
          style={form.coverUrl ? { backgroundImage: `url(${form.coverUrl})` } : undefined}
        >
          <span className="crm-profile__cover-label">Prévia do perfil</span>
        </div>

        <div className="crm-profile__sheet">
          <div className="crm-profile__avatar-col">
            <input
              ref={avatarFileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                void onPickFile('avatar', e.target.files?.[0]);
                e.target.value = '';
                setAvatarMenuOpen(false);
              }}
            />
            <div
              ref={avatarWrapRef}
              className={`crm-profile__avatar-wrap ${avatarMenuOpen ? 'is-open' : ''}`}
            >
              <button
                type="button"
                className="crm-profile__avatar"
                style={form.avatarUrl ? { backgroundImage: `url(${form.avatarUrl})` } : undefined}
                aria-label="Alterar foto do perfil"
                aria-expanded={avatarMenuOpen}
                onClick={() => setAvatarMenuOpen((open) => !open)}
              >
                {!form.avatarUrl ? initials(form.displayName || me.sellerName) : null}
                <span className="crm-profile__avatar-overlay" aria-hidden>
                  <svg viewBox="0 0 24 24" width="28" height="28">
                    <path
                      fill="currentColor"
                      d="M9 3 7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-2.2A2.8 2.8 0 1 0 12 9.2a2.8 2.8 0 0 0 0 5.6z"
                    />
                  </svg>
                  <em>Alterar foto</em>
                </span>
              </button>

              {avatarMenuOpen ? (
                <div className="crm-profile__avatar-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => avatarFileRef.current?.click()}
                  >
                    Escolher da máquina
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setCamTarget('avatar');
                      setAvatarMenuOpen(false);
                    }}
                  >
                    Tirar com webcam
                  </button>
                  {form.avatarUrl ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        patch('avatarUrl', '');
                        setAvatarMenuOpen(false);
                      }}
                    >
                      Remover foto
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="crm-profile__info">
            <div className="crm-profile__name-row">
              <h2>{form.displayName || 'Seu nome'}</h2>
              {form.publicProfile ? (
                <span className="crm-profile__badge is-public">Público</span>
              ) : (
                <span className="crm-profile__badge">Privado</span>
              )}
            </div>
            <p className="crm-profile__handle">
              @{form.handle || 'handle'}
              {form.specialty ? ` · ${form.specialty}` : ''}
              {form.city ? ` · ${form.city}` : ''}
            </p>
            <p className="crm-profile__bio">{form.bio || 'Sua bio aparece aqui.'}</p>
            <div className="crm-profile__links">
              {form.whatsapp ? <span>WA {form.whatsapp}</span> : null}
              {form.instagram ? <span>@{form.instagram}</span> : null}
              {form.linkedin ? <span>LinkedIn</span> : null}
              {form.website ? <span>Site</span> : null}
            </div>
          </div>

          <div className="crm-profile__actions">
            <Link className="btn btn--ghost" to="/crm/rede">
              Ver na rede
            </Link>
          </div>
        </div>
      </article>

      <form className="crm-profile__form" onSubmit={submit}>
        <header className="crm-profile__form-head">
          <div>
            <h3>Configurar perfil</h3>
            <p>Foto da máquina ou webcam · alterações na prévia em tempo real.</p>
          </div>
          <div className="crm-profile__form-actions">
            {dirty ? (
              <button type="button" className="btn btn--ghost" onClick={reset}>
                Descartar
              </button>
            ) : null}
            <button type="submit" className="btn btn--primary">
              Salvar perfil
            </button>
          </div>
        </header>

        <fieldset className="crm-profile__fieldset">
          <legend>Identidade</legend>
          <div className="crm-profile__grid">
            <label>
              Nome de exibição
              <input
                value={form.displayName}
                onChange={(e) => patch('displayName', e.target.value)}
                required
              />
            </label>
            <label>
              @handle
              <input
                value={form.handle}
                onChange={(e) => patch('handle', e.target.value)}
                required
              />
            </label>
            <label>
              Especialidade
              <input
                value={form.specialty}
                onChange={(e) => patch('specialty', e.target.value)}
                placeholder="Ex.: Totem e PDV"
              />
            </label>
            <label>
              Cidade
              <input
                value={form.city}
                onChange={(e) => patch('city', e.target.value)}
                placeholder="Ex.: Volta Redonda — RJ"
              />
            </label>
            <label className="crm-profile__span-2">
              Bio
              <textarea
                value={form.bio}
                onChange={(e) => patch('bio', e.target.value)}
                rows={3}
                placeholder="Conte quem você é e como ajuda o cliente Marthi."
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="crm-profile__fieldset">
          <legend>Foto e capa</legend>
          <div className="crm-profile__media-row">
            <div className="crm-profile__media-block">
              <strong>Foto do perfil</strong>
              <p>Escolha um arquivo da máquina ou tire com a webcam.</p>
              <input
                ref={coverFileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  void onPickFile('cover', e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <div className="crm-profile__photo-actions">
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => avatarFileRef.current?.click()}
                >
                  Escolher arquivo
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setCamTarget('avatar')}
                >
                  Abrir webcam
                </button>
              </div>
            </div>
            <div className="crm-profile__media-block">
              <strong>Capa</strong>
              <p>Imagem de fundo do perfil na rede.</p>
              <div className="crm-profile__photo-actions">
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => coverFileRef.current?.click()}
                >
                  Escolher arquivo
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setCamTarget('cover')}
                >
                  Abrir webcam
                </button>
                {form.coverUrl ? (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => patch('coverUrl', '')}
                  >
                    Limpar capa
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </fieldset>

        <fieldset className="crm-profile__fieldset">
          <legend>Contato e redes</legend>
          <div className="crm-profile__grid">
            <label>
              WhatsApp
              <input
                value={form.whatsapp}
                onChange={(e) => patch('whatsapp', e.target.value)}
                placeholder="24999999999"
              />
            </label>
            <label>
              Instagram
              <input
                value={form.instagram}
                onChange={(e) => patch('instagram', e.target.value)}
                placeholder="usuario"
              />
            </label>
            <label>
              LinkedIn
              <input
                value={form.linkedin}
                onChange={(e) => patch('linkedin', e.target.value)}
                placeholder="https://linkedin.com/in/…"
              />
            </label>
            <label>
              Site
              <input
                value={form.website}
                onChange={(e) => patch('website', e.target.value)}
                placeholder="https://…"
              />
            </label>
            <label className="crm-profile__span-2 crm-profile__check">
              <input
                type="checkbox"
                checked={form.publicProfile}
                onChange={(e) => patch('publicProfile', e.target.checked)}
              />
              <span>
                Perfil público na rede Marthi
                <em>Se desmarcar, só você vê este perfil na rede.</em>
              </span>
            </label>
          </div>
        </fieldset>

        <footer className="crm-profile__form-foot">
          <span className="crm-profile__dirty">
            {dirty ? 'Alterações não salvas' : 'Tudo salvo'}
          </span>
          <button type="submit" className="btn btn--primary">
            Salvar perfil
          </button>
        </footer>
      </form>

      {camTarget ? (
        <WebcamCapture
          title={camTarget === 'avatar' ? 'Foto do perfil' : 'Foto da capa'}
          onCapture={(dataUrl) => {
            patch(camTarget === 'avatar' ? 'avatarUrl' : 'coverUrl', dataUrl);
            setError('');
          }}
          onClose={() => setCamTarget(null)}
        />
      ) : null}
    </section>
  );
}
