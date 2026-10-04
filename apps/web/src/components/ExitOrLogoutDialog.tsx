import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getTotemExitPassword } from '../data/totemSettings';
import { AdminIcon } from './AdminIcons';
import './exitOrLogout.css';

type ExitOrLogoutDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Nome do app (ex.: ERP, PDV). */
  appName: string;
  /** Rótulo do botão de saída do módulo (ex.: "Sair do ERP"). */
  exitActionLabel?: string;
  afterExitTo?: string;
  requireStorePassword?: boolean;
  logoutOnly?: boolean;
  onModuleExit?: () => void;
};

type Step = 'choose' | 'password';

/**
 * Diálogo unificado do botão Sair:
 * - Sair → deixa o módulo (senha da loja quando aplicável)
 * - Log-out → encerra a sessão Marthi
 */
export function ExitOrLogoutDialog({
  open,
  onClose,
  appName,
  exitActionLabel,
  afterExitTo,
  requireStorePassword = true,
  logoutOnly = false,
  onModuleExit,
}: ExitOrLogoutDialogProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const defaultDest = user ? '/painel' : '/';
  const targetExitPath = afterExitTo ?? defaultDest;
  const [step, setStep] = useState<Step>('choose');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const leaveLabel = exitActionLabel ?? `Sair do ${appName}`;

  useEffect(() => {
    if (!open) return;
    setStep('choose');
    setPassword('');
    setError(null);
  }, [open]);

  if (!open) return null;

  function close() {
    setPassword('');
    setError(null);
    setStep('choose');
    onClose();
  }

  function doLogout() {
    close();
    logout();
    navigate('/login', { replace: true });
  }

  function leaveModule() {
    onModuleExit?.();
    navigate(targetExitPath);
    close();
  }

  function onPickExit() {
    if (requireStorePassword) {
      setStep('password');
      setPassword('');
      setError(null);
      return;
    }
    leaveModule();
  }

  function confirmPassword(event: FormEvent) {
    event.preventDefault();
    if (password.trim() !== getTotemExitPassword()) {
      setError('Senha incorreta. Só a loja pode sair deste app.');
      return;
    }
    leaveModule();
  }

  const titleId = 'exit-or-logout-title';

  if (logoutOnly) {
    return (
      <div className="exit-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="exit-dialog__card">
          <span className="exit-dialog__symbol" aria-hidden="true"><AdminIcon name="logout" /></span>
          <span className="exit-dialog__eyebrow">Conta Marthi</span>
          <h2 id={titleId}>Encerrar sessão?</h2>
          <p>
            Você sairá da sua conta neste dispositivo. Para continuar usando o Marthi, entre novamente com seu e-mail e senha.
          </p>
          <div className="exit-dialog__actions">
            <button type="button" className="btn btn--ghost" onClick={close}>
              Cancelar
            </button>
            <button type="button" className="btn btn--primary exit-dialog__logout" onClick={doLogout}>
              <AdminIcon name="logout" />
              Encerrar sessão
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'password') {
    return (
      <div className="exit-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <form className="exit-dialog__card" onSubmit={confirmPassword}>
          <h2 id={titleId}>Saída protegida</h2>
          <p>
            Digite a senha da loja para {leaveLabel.toLowerCase()}.
          </p>
          {error ? (
            <p className="exit-dialog__error" role="alert">
              {error}
            </p>
          ) : null}
          <label>
            Senha
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              autoComplete="current-password"
            />
          </label>
          <div className="exit-dialog__actions">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setStep('choose');
                setPassword('');
                setError(null);
              }}
            >
              Voltar
            </button>
            <button type="submit" className="btn btn--primary">
              {leaveLabel}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="exit-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="exit-dialog__card">
        <h2 id={titleId}>Sair</h2>
        <p>Escolha para onde deseja ir ao sair do {appName}.</p>
        <div className="exit-dialog__choices">
          {appName !== 'Painel' && user ? (
            <button
              type="button"
              className="exit-dialog__choice exit-dialog__choice--panel"
              onClick={() => {
                onModuleExit?.();
                navigate('/painel');
                close();
              }}
            >
              <strong>Voltar ao Painel Administrativo</strong>
              <span>Acessar a central de gestão, relatórios e cadastros da loja.</span>
            </button>
          ) : null}
          <button type="button" className="exit-dialog__choice" onClick={onPickExit}>
            <strong>{leaveLabel}</strong>
            <span>Fecha este app{requireStorePassword ? ' (pede senha da loja)' : ''}.</span>
          </button>
          <button
            type="button"
            className="exit-dialog__choice exit-dialog__choice--logout"
            onClick={doLogout}
          >
            <strong>{user ? 'Encerrar sessão' : 'Entrar na conta'}</strong>
            <span>
              {user
                ? 'Encerra a conta Marthi e volta para a tela de login.'
                : 'Acessa a tela de login para entrar com seu usuário.'}
            </span>
          </button>
        </div>
        <div className="exit-dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={close}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
