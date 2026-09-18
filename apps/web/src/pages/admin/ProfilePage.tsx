import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  fileToProfilePhoto,
  getOperatorProfile,
  notifyProfileUpdated,
  saveOperatorProfile,
} from '../../data/operatorProfile';

export function ProfilePage() {
  const { user } = useAuth();
  const fallback = user?.name ?? 'Operador';
  const current = getOperatorProfile(fallback);
  const [displayName, setDisplayName] = useState(current.displayName);
  const [role, setRole] = useState(current.role);
  const [photo, setPhoto] = useState<string | null>(current.photo);
  const [saved, setSaved] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const preview = photo || user?.picture;
  const mark = displayName.trim().slice(0, 1).toUpperCase() || 'U';

  async function onPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPhotoError(null);
    try {
      const next = await fileToProfilePhoto(file);
      setPhoto(next);
      setSaved(false);
    } catch {
      setPhotoError('Não foi possível usar esta imagem. Tente outro arquivo.');
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    saveOperatorProfile({ displayName, role, photo });
    setSaved(true);
    notifyProfileUpdated();
  }

  return (
    <section className="admin-page">
      <article className="admin-card admin-card--form">
        <h2>Seu perfil na Sua Loja</h2>
        <p>Foto, nome e cargo aparecem no painel lateral. Cada pessoa da operação ajusta o próprio.</p>
        <form className="admin-form" onSubmit={submit}>
          <div className="span-2 admin-photo-field">
            <label className="admin-photo-picker">
              <span className="admin-photo-picker__frame">
                {preview ? <img src={preview} alt="" /> : <span>{mark}</span>}
              </span>
              <input type="file" accept="image/*" onChange={onPhoto} />
              <span className="admin-photo-picker__copy">
                <strong>Foto do perfil</strong>
                <em>Clique para enviar uma imagem</em>
              </span>
            </label>
            {photo ? (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setPhoto(null);
                  setSaved(false);
                }}
              >
                Remover foto
              </button>
            ) : null}
            {photoError ? <p className="qty-low">{photoError}</p> : null}
          </div>
          <label>
            Nome
            <input
              value={displayName}
              onChange={(event) => {
                setDisplayName(event.target.value);
                setSaved(false);
              }}
              required
            />
          </label>
          <label>
            Cargo na empresa
            <input
              value={role}
              onChange={(event) => {
                setRole(event.target.value);
                setSaved(false);
              }}
              placeholder="Gerente, vendedor, caixa…"
              required
            />
          </label>
          <label className="span-2">
            E-mail da conta
            <input value={user?.email ?? ''} readOnly />
          </label>
          <div className="span-2 admin-toolbar">
            <button type="submit" className="btn btn--primary">
              Salvar perfil
            </button>
            {saved ? <span className="empty">Perfil atualizado.</span> : null}
          </div>
        </form>
      </article>
    </section>
  );
}
