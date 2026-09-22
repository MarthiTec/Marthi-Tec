import { useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { useAuth } from '../contexts/AuthContext';
import { ingestContractInterestToCrm } from '../data/crmStore';
import { resolveAppHome, userIsStoreAdmin } from '../data/erpRegistry';
import { isMarthiStaffEmail } from '../data/marthiStaff';

type AuthView = 'login' | 'forgot' | 'signup';

function safeNext(value: string | null, email: string | null | undefined) {
  const fallback = resolveAppHome(email);
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return fallback;
  }
  if (value.startsWith('/marthi')) {
    if (!isMarthiStaffEmail(email)) return fallback;
    return value;
  }
  if (value === '/painel' && !userIsStoreAdmin(email) && !isMarthiStaffEmail(email)) {
    return fallback;
  }
  return value;
}

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, loading, providers, loginWithPassword, loginWithGoogle } = useAuth();
  const nextParam = params.get('next');
  const [view, setView] = useState<AuthView>(() =>
    params.get('view') === 'signup' ? 'signup' : params.get('view') === 'forgot' ? 'forgot' : 'login',
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [company, setCompany] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const googleClientId = useMemo(
    () => providers?.googleClientId ?? import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
    [providers],
  );

  const next = safeNext(nextParam, user?.email);

  if (!loading && user) {
    return <Navigate to={next} replace />;
  }

  function goView(nextView: AuthView) {
    setView(nextView);
    setError(null);
    setFeedback(null);
  }

  async function handlePasswordLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFeedback(null);
    setSubmitting(true);
    try {
      const sessionEmail = email.trim().toLowerCase();
      await loginWithPassword(sessionEmail, password);
      navigate(safeNext(nextParam, sessionEmail), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle(idToken: string) {
    setError(null);
    setFeedback(null);
    setSubmitting(true);
    try {
      await loginWithGoogle(idToken);
      navigate(safeNext(nextParam, null), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login com Google.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleForgot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const mail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      setError('Informe um e-mail válido.');
      return;
    }
    setFeedback(
      'Se este e-mail estiver cadastrado na loja, o gestor receberá o pedido de redefinição. Operadores não criam senha sozinhos — peça ao administrador da loja.',
    );
  }

  function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFeedback(null);
    const result = ingestContractInterestToCrm({
      name,
      email,
      whatsapp,
      company,
      notes: 'Cadastro iniciado pela tela de login · interesse em contratar.',
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setFeedback(
      'Recebemos seu interesse. Você entrou como lead no CRM Marthi. Nossa equipe comercial entra em contato para fechar o plano — depois o gestor da loja cadastra os operadores com e-mail, senha e função.',
    );
    setName('');
    setWhatsapp('');
    setCompany('');
    setEmail('');
  }

  return (
    <div className="auth auth--modern">
      <div className="auth__bg" aria-hidden="true" />
      <Link to="/" className="auth__back">
        ← Voltar ao site
      </Link>

      <div className="auth__card">
        <BrandLogo variant="mark" className="auth__mark" />
        <p className="auth__tenant">Marthi Tecnologia</p>

        {view === 'login' ? (
          <>
            <h1>Entrar</h1>
            <p className="auth__lead">
              Use o e-mail e a senha que o <strong>gestor da loja</strong> cadastrou para você. A
              função do operador abre o app certo (painel, caixa, OS, fiscal…).
            </p>
          </>
        ) : null}
        {view === 'forgot' ? (
          <>
            <h1>Esqueci a senha</h1>
            <p className="auth__lead">
              Informe o e-mail de acesso. A redefinição passa pelo administrador da loja — operadores
              não alteram senha sem permissão.
            </p>
          </>
        ) : null}
        {view === 'signup' ? (
          <>
            <h1>Quero contratar</h1>
            <p className="auth__lead">
              Ainda não é cliente? Deixe seus dados — viramos lead no CRM e a equipe Marthi apresenta
              o plano. Operadores da loja são cadastrados depois pelo gestor.
            </p>
          </>
        ) : null}

        {error ? (
          <p className="auth__error" role="alert">
            {error}
          </p>
        ) : null}
        {feedback ? (
          <p className="auth__ok" role="status">
            {feedback}
          </p>
        ) : null}

        {view === 'login' ? (
          <form className="auth__form" onSubmit={handlePasswordLogin}>
            <label>
              E-mail
              <input
                type="email"
                name="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="voce@loja.com.br"
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
              {submitting ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        ) : null}

        {view === 'forgot' ? (
          <form className="auth__form" onSubmit={handleForgot}>
            <label>
              E-mail cadastrado
              <input
                type="email"
                name="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="voce@loja.com.br"
                autoComplete="username"
                required
              />
            </label>
            <button type="submit" className="btn btn--primary btn--block">
              Enviar pedido
            </button>
          </form>
        ) : null}

        {view === 'signup' ? (
          <form className="auth__form" onSubmit={handleSignup}>
            <label>
              Seu nome
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Nome completo"
                required
                minLength={2}
              />
            </label>
            <label>
              Empresa
              <input
                type="text"
                value={company}
                onChange={(event) => setCompany(event.target.value)}
                placeholder="Nome da loja"
              />
            </label>
            <label>
              E-mail
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="voce@empresa.com.br"
                required
              />
            </label>
            <label>
              WhatsApp
              <input
                type="tel"
                value={whatsapp}
                onChange={(event) => setWhatsapp(event.target.value)}
                placeholder="(24) 99999-9999"
                required
              />
            </label>
            <button type="submit" className="btn btn--primary btn--block">
              Enviar interesse
            </button>
            <p className="auth__hint">
              Para cadastro completo com CNPJ e plano, use{' '}
              <Link to="/parceiro">Solicitar demo</Link>.
            </p>
          </form>
        ) : null}

        {view === 'login' ? (
          <>
            <div className="auth__links">
              <button type="button" className="auth__link" onClick={() => goView('forgot')}>
                Esqueci minha senha
              </button>
              <button type="button" className="auth__link" onClick={() => goView('signup')}>
                Quero me cadastrar
              </button>
            </div>

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
                  Configure <code>GOOGLE_CLIENT_ID</code> no backend para habilitar o Google.
                </p>
              </div>
            )}
          </>
        ) : (
          <button type="button" className="auth__link auth__link--back" onClick={() => goView('login')}>
            ← Voltar ao login
          </button>
        )}
      </div>
    </div>
  );
}
