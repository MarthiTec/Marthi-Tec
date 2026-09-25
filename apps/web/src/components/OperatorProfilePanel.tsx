import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ERP_BOOTSTRAP_EVENT } from '../data/erpBootstrap';
import { getPanelTheme } from '../data/panelThemeStore';
import { getTotemExitPassword } from '../data/totemSettings';
import {
  fileToProfilePhoto,
  getOperatorProfile,
  notifyProfileUpdated,
  PROFILE_EVENT,
  profileInitials,
  saveOperatorProfile,
} from '../data/operatorProfile';
import { PresenceStatusControl } from './PresenceStatusControl';
import { PanelThemeToggle } from './PanelThemeToggle';
import './operatorProfilePanel.css';

type OperatorProfilePanelProps = {
  /** Rótulo do ambiente (ex.: Painel, ERP, Fiscal). */
  workspaceLabel?: string;
};

/**
 * Perfil operacional único do sistema — mesma tela em painel, ERP, CRM, OS, etc.
 * Foto, nome, e-mail, telefone e endereço: o usuário edita.
 * Cargo/função: só com senha de gerente (ou pelo ERP/admin).
 */
export function OperatorProfilePanel({ workspaceLabel = 'Marthi' }: OperatorProfilePanelProps) {
  const { user } = useAuth();
  const fallback = user?.name ?? 'Operador';
  const fallbackEmail = user?.email ?? '';
  const current = getOperatorProfile(fallback, fallbackEmail);

  const [displayName, setDisplayName] = useState(current.displayName);
  const [role, setRole] = useState(current.role);
  const [photo, setPhoto] = useState<string | null>(current.photo);
  const [email, setEmail] = useState(current.email || fallbackEmail);
  const [phone, setPhone] = useState(current.phone);
  const [address, setAddress] = useState(current.address);
  const [saved, setSaved] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [roleUnlocked, setRoleUnlocked] = useState(false);
  const [managerPassword, setManagerPassword] = useState('');
  const [roleError, setRoleError] = useState<string | null>(null);

  function hydrateForm() {
    const next = getOperatorProfile(fallback, fallbackEmail);
    setDisplayName(next.displayName);
    setRole(next.role);
    setPhoto(next.photo);
    setEmail(next.email || fallbackEmail);
    setPhone(next.phone);
    setAddress(next.address);
    setRoleUnlocked(false);
    setManagerPassword('');
    setRoleError(null);
  }

  useEffect(() => {
    hydrateForm();
  }, [fallback, fallbackEmail]);

  useEffect(() => {
    const onSync = () => hydrateForm();
    window.addEventListener(PROFILE_EVENT, onSync);
    window.addEventListener(ERP_BOOTSTRAP_EVENT, onSync);
    return () => {
      window.removeEventListener(PROFILE_EVENT, onSync);
      window.removeEventListener(ERP_BOOTSTRAP_EVENT, onSync);
    };
  }, [fallback, fallbackEmail]);

  const preview = photo || user?.picture || null;
  const mark = profileInitials(displayName);

  function touch() {
    setSaved(false);
  }

  async function onPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPhotoError(null);
    try {
      const next = await fileToProfilePhoto(file);
      setPhoto(next);
      touch();
    } catch {
      setPhotoError('Não foi possível usar esta imagem. Tente outro arquivo.');
    }
  }

  function unlockRole() {
    if (managerPassword.trim() !== getTotemExitPassword()) {
      setRoleError('Senha de gerente incorreta.');
      return;
    }
    setRoleUnlocked(true);
    setRoleError(null);
    setManagerPassword('');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPhotoError(null);
    try {
      await saveOperatorProfile(
        {
          displayName,
          role,
          photo,
          email,
          phone,
          address,
          theme: getPanelTheme(),
        },
        { allowRole: roleUnlocked },
      );
      setSaved(true);
      notifyProfileUpdated();
      hydrateForm();
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Não foi possível salvar o perfil. Tente de novo.';
      setPhotoError(message);
      setSaved(false);
    }
  }

  return (
    <section className="op-profile">
      <p className="op-profile__lead">
        Seu perfil em todo o {workspaceLabel}. Foto, nome e contato valem no painel, Retaguarda, CRM, PDV,
        OS, fiscal e e-commerce. Cargo só muda com senha de gerente ou pela Retaguarda.
      </p>

      {saved ? <p className="op-profile__ok">Perfil atualizado em todos os apps.</p> : null}
      {photoError ? <p className="op-profile__err">{photoError}</p> : null}

      <article className="op-profile__card">
        <div className="op-profile__cover">
          <span className="op-profile__cover-label">Prévia</span>
        </div>

        <div className="op-profile__sheet">
          <label className="op-profile__avatar">
            {preview ? <img src={preview} alt="" /> : <span>{mark}</span>}
            <input type="file" accept="image/*" onChange={onPhoto} />
            <em className="op-profile__avatar-hint">Trocar foto</em>
          </label>

          <div className="op-profile__info">
            <div className="op-profile__name-row">
              <h2>{displayName || 'Seu nome'}</h2>
              <span className="op-profile__badge">{role || 'Operador'}</span>
            </div>
            <p className="op-profile__meta">
              {[email || null, phone || null].filter(Boolean).join(' · ') ||
                'Complete seus contatos abaixo'}
            </p>
            <p className="op-profile__address">{address || 'Endereço ainda não informado.'}</p>
            <div className="op-profile__presence">
              <PresenceStatusControl />
            </div>
          </div>
        </div>
      </article>

      <form className="op-profile__form" onSubmit={submit}>
        <header className="op-profile__form-head">
          <div>
            <h3>Configurar perfil</h3>
            <p>Dados básicos do usuário · alterações na prévia acima.</p>
          </div>
          <button type="submit" className="btn btn--primary">
            Salvar perfil
          </button>
        </header>

        <fieldset className="op-profile__fieldset">
          <legend>Identidade</legend>
          <div className="op-profile__grid">
            <label>
              Nome de exibição
              <input
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  touch();
                }}
                required
              />
            </label>
            <label>
              Cargo / função
              <input
                value={role}
                onChange={(e) => {
                  setRole(e.target.value);
                  touch();
                }}
                disabled={!roleUnlocked}
                readOnly={!roleUnlocked}
              />
            </label>
          </div>
          {!roleUnlocked ? (
            <div className="op-profile__role-lock">
              <p>
                Cargo é definido pela Retaguarda ou painel administrativo. Para alterar aqui, use a senha de
                gerente.
              </p>
              <div className="op-profile__role-unlock">
                <input
                  type="password"
                  value={managerPassword}
                  onChange={(e) => {
                    setManagerPassword(e.target.value);
                    setRoleError(null);
                  }}
                  placeholder="Senha de gerente"
                  autoComplete="current-password"
                />
                <button type="button" className="btn btn--ghost" onClick={unlockRole}>
                  Liberar cargo
                </button>
              </div>
              {roleError ? <p className="op-profile__err">{roleError}</p> : null}
            </div>
          ) : (
            <p className="op-profile__role-open">Cargo liberado nesta sessão — salve para gravar.</p>
          )}
        </fieldset>

        <fieldset className="op-profile__fieldset">
          <legend>Contato</legend>
          <div className="op-profile__grid">
            <label>
              E-mail
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  touch();
                }}
                placeholder="seu@email.com"
              />
            </label>
            <label>
              Telefone / WhatsApp
              <input
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  touch();
                }}
                placeholder="(24) 99999-0000"
              />
            </label>
            <label className="op-profile__span-2">
              Endereço
              <input
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  touch();
                }}
                placeholder="Rua, número, bairro, cidade — UF"
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="op-profile__fieldset">
          <legend>Aparência</legend>
          <PanelThemeToggle />
        </fieldset>

        <footer className="op-profile__form-foot">
          {photo ? (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setPhoto(null);
                touch();
              }}
            >
              Remover foto
            </button>
          ) : (
            <span />
          )}
          <button type="submit" className="btn btn--primary">
            Salvar perfil
          </button>
        </footer>
      </form>
    </section>
  );
}
