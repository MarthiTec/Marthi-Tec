import { useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { useAuth } from '../contexts/AuthContext';

export function LoginPage() {
  const navigate = useNavigate();
  const { user, loading, providers, loginWithPassword, loginWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const googleClientId = useMemo(
    () => providers?.googleClientId ?? import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
    [providers],
  );

  if (!loading && user) {
    return <Navigate to="/painel" replace />;
  }

  async function handlePasswordLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await loginWithPassword(email, password);
      navigate('/painel', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle(idToken: string) {
    setError(null);
    setSubmitting(true);
    try {
      await loginWithGoogle(idToken);
      navigate('/painel', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login com Google.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth">
      <Link to="/" className="auth__back">
        ← Voltar
      </Link>

      <div className="auth__card">
        <BrandLogo variant="mark" className="auth__mark" />
        <h1>Entrar</h1>
        <p className="auth__lead">Acesse o painel Marthi com sua conta.</p>

        {error && <p className="auth__error">{error}</p>}

        <form className="auth__form" onSubmit={handlePasswordLogin}>
          <label>
            E-mail
            <input
              type="email"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="voce@empresa.com"
              autoComplete="username"
              required
              disabled={submitting}
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              name="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              disabled={submitting}
            />
          </label>
          <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
            {submitting ? 'Entrando…' : 'Continuar'}
          </button>
        </form>

        <div className="auth__divider" role="separator">
          <span>ou</span>
        </div>

        {googleClientId ? (
          <GoogleSignInButton
            clientId={googleClientId}
            disabled={submitting}
            onSuccess={handleGoogle}
            onError={setError}
          />
        ) : (
          <div className="auth__google-hint">
            <button type="button" className="btn btn--google btn--block" disabled>
              Continuar com Google
            </button>
            <p>
              Configure <code>VITE_GOOGLE_CLIENT_ID</code> e <code>GOOGLE_CLIENT_ID</code> para
              habilitar.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
