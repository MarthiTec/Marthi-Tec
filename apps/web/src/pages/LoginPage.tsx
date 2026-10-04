import { useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { useAuth } from '../contexts/AuthContext';
import { ingestContractInterestToCrm } from '../data/crmStore';
import { resolveAppHome, userIsStoreAdmin } from '../data/erpRegistry';
import './loginPage.css';
import { isMarthiStaffEmail } from '../data/marthiStaff';
import { nestApiUrl } from '../services/config';

type AuthView = 'login' | 'forgot' | 'signup' | 'first-access';
type LoginStep = 'email' | 'password';

type IdentifiedUser = {
  identified: boolean;
  hasPassword: boolean;
  needsFirstAccess: boolean;
  name?: string;
  storeName?: string;
  role?: string;
  email: string;
  message?: string;
};

function safeNext(value: string | null, email: string | null | undefined) {
  /** Conta Marthi sempre entra no painel administrativo interno. */
  if (isMarthiStaffEmail(email)) {
    if (value?.startsWith('/admin')) return value;
    if (value?.startsWith('/marthi')) return value.replace(/^\/marthi/, '/admin');
    return '/admin';
  }

  const fallback = resolveAppHome(email);
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return fallback;
  }
  if (value.startsWith('/admin') || value.startsWith('/marthi')) {
    return fallback;
  }
  if (value === '/painel' && !userIsStoreAdmin(email)) {
    return fallback;
  }
  return value;
}

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, loading, providers, loginWithPassword, loginWithGoogle } = useAuth();
  const nextParam = params.get('next');

  const [view, setView] = useState<AuthView>(() => {
    const v = params.get('view');
    if (v === 'signup') return 'signup';
    if (v === 'forgot') return 'forgot';
    if (v === 'first-access' || v === 'primeiro-acesso') return 'first-access';
    return 'login';
  });

  const [loginStep, setLoginStep] = useState<LoginStep>('email');
  const [identifiedUser, setIdentifiedUser] = useState<IdentifiedUser | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    if (nextView === 'login') {
      setLoginStep('email');
      setIdentifiedUser(null);
      setPassword('');
    }
  }

  /** Etapa 1: Validação e identificação do e-mail (a senha fica invisível nesta etapa) */
  async function handleEmailContinue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFeedback(null);
    const sessionEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sessionEmail)) {
      setError('Informe um e-mail válido para continuar.');
      return;
    }

    setSubmitting(true);
    try {
      const apiUrl = nestApiUrl();
      let identifyData: IdentifiedUser | null = null;

      const res = await fetch(`${apiUrl}/api/v1/auth/identify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: sessionEmail }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success || !json.data) {
        throw new Error(json?.error?.message || 'Não foi possível consultar seu cadastro. Tente novamente.');
      }
      identifyData = json.data;
      setEmail(sessionEmail);
      if (!identifyData?.identified) {
        setView('first-access');
        setFeedback(
          'E-mail não localizado diretamente na base ativa. Se você está realizando seu primeiro acesso, solicite seu link abaixo:',
        );
        return;
      }

      // 3. Avalia o resultado da identificação
      if (identifyData && identifyData.identified && identifyData.hasPassword) {
        // Usuário cadastrado e com senha pronta -> solicita a senha
        setIdentifiedUser(identifyData);
        setLoginStep('password');
        setError(null);
      } else if (identifyData && (identifyData.needsFirstAccess || !identifyData.hasPassword)) {
        // Usuário cadastrado mas sem senha configurada -> abre tela de primeiro acesso com e-mail preenchido
        setIdentifiedUser(identifyData);
        setView('first-access');
        setFeedback(
          identifyData.message ||
            `Identificamos o cadastro de ${identifyData.name || 'sua loja'}! Esta conta ainda precisa configurar a senha de primeiro acesso.`,
        );
      } else {
        // Usuário não cadastrado -> abre automaticamente a tela de primeiro acesso com o e-mail preenchido
        setView('first-access');
        setFeedback(
          `O e-mail ${sessionEmail} não foi localizado na base de usuários ativos. Se sua empresa contratou recentemente, confirme seu primeiro acesso abaixo ou solicite o cadastro.`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao identificar e-mail.');
    } finally {
      setSubmitting(false);
    }
  }

  /** Etapa 2: Autenticação com senha e redirecionamento conforme a loja e permissão */
  async function handlePasswordLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFeedback(null);
    setSubmitting(true);
    try {
      const sessionEmail = email.trim().toLowerCase();
      const sessionUser = await loginWithPassword(sessionEmail, password);
      navigate(safeNext(nextParam, sessionUser.email || sessionEmail), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar. Verifique sua senha.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle(idToken: string) {
    setError(null);
    setFeedback(null);
    setSubmitting(true);
    try {
      const sessionUser = await loginWithGoogle(idToken);
      navigate(safeNext(nextParam, sessionUser.email), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login com Google.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFeedback(null);
    const mail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      setError('Informe um e-mail válido.');
      return;
    }

    setSubmitting(true);
    try {
      const apiUrl = nestApiUrl();
      const res = await fetch(`${apiUrl}/api/v1/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: mail }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message || 'Não foi possível enviar a solicitação. Tente novamente.');
      setFeedback(
        json?.data?.message ||
          'Caso o e-mail informado esteja cadastrado no sistema, enviamos as instruções e o link seguro para redefinição de senha.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar a solicitação. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFirstAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFeedback(null);
    const mail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      setError('Informe um e-mail válido.');
      return;
    }

    setSubmitting(true);
    try {
      const apiUrl = nestApiUrl();
      const res = await fetch(`${apiUrl}/api/v1/auth/first-access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: mail }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message || 'Não foi possível solicitar o acesso. Tente novamente.');
      if (json?.data?.activationUrl) {
        setFeedback(
          'Link de ativação gerado com sucesso! Você pode usar o link enviado por e-mail ou prosseguir diretamente para criar sua senha.',
        );
      } else {
        setFeedback(
          json?.data?.message ||
            'Se o e-mail informado estiver cadastrado, enviamos as instruções e o link seguro para você definir sua senha de primeiro acesso.',
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar a solicitação. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFeedback(null);
    const result = await ingestContractInterestToCrm({
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
    <div className="auth auth--modern auth--login">
      <div className="auth__bg" aria-hidden="true" />
      <Link to="/" className="auth__back">
        ← Voltar ao site
      </Link>

      <div className="auth__card">
        <BrandLogo variant="mark" className="auth__mark" />
        <p className="auth__tenant">Marthi Tecnologia</p>

        {view === 'login' ? (
          <>
            <h1>Entre na sua conta</h1>
            <p className="auth__lead">
              {loginStep === 'email'
                ? 'Informe seu e-mail. Identificamos automaticamente como você deve acessar.'
                : 'Identificação confirmada. Digite sua senha para entrar na loja.'}
            </p>
          </>
        ) : null}

        {view === 'forgot' ? (
          <>
            <h1>Esqueci a senha</h1>
            <p className="auth__lead">
              Informe o e-mail cadastrado. A redefinição passa pelo administrador da loja para sua segurança.
            </p>
          </>
        ) : null}

        {view === 'signup' ? (
          <>
            <h1>Quero contratar</h1>
            <p className="auth__lead">
              Ainda não é cliente? Deixe seus dados — viramos lead no CRM e a equipe Marthi apresenta
              o plano sob medida.
            </p>
          </>
        ) : null}

        {view === 'first-access' ? (
          <>
            <h1>Ativação de Primeiro Acesso</h1>
            <p className="auth__lead">
              Sua conta foi criada pelo gestor ou pela equipe Marthi? Confirme seu e-mail para ativar
              o acesso e cadastrar sua senha.
            </p>
          </>
        ) : null}

        {error ? (
          <div className="auth__error" role="alert">
            <div>{error}</div>
            {view === 'login' && loginStep === 'password' && (
              <div style={{ marginTop: '8px', fontSize: '0.82rem', opacity: 0.95 }}>
                Esqueceu a senha?{' '}
                <button
                  type="button"
                  style={{
                    textDecoration: 'underline',
                    background: 'none',
                    border: 'none',
                    color: 'inherit',
                    font: 'inherit',
                    cursor: 'pointer',
                    padding: 0,
                    fontWeight: 700,
                  }}
                  onClick={() => goView('forgot')}
                >
                  Clique aqui para redefinir
                </button>
              </div>
            )}
          </div>
        ) : null}

        {feedback ? (
          <div className="auth__ok" role="status">
            <div>{feedback}</div>
            {view === 'first-access' && (
              <div style={{ marginTop: '12px' }}>
                <Link
                  to={email ? `/criar-senha?email=${encodeURIComponent(email)}` : '/criar-senha'}
                  className="btn btn--secondary btn--block"
                  style={{ fontSize: '0.86rem', textAlign: 'center' }}
                >
                  🔑 Possui o Token de Ativação? Criar Senha Agora →
                </Link>
              </div>
            )}
          </div>
        ) : null}

        {/* FLUXO DE LOGIN PROGRESSIVO */}
        {view === 'login' && loginStep === 'email' ? (
          /* ETAPA 1: APENAS E-MAIL (A SENHA FICA TOTALMENTE INVISÍVEL) */
          <form className="auth__form" onSubmit={handleEmailContinue}>
            <label>
              E-mail de acesso
              <input
                type="email"
                name="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="voce@loja.com.br"
                autoComplete="username"
                autoFocus
                required
                disabled={submitting}
              />
            </label>
            <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
              {submitting ? 'Identificando acesso…' : 'Continuar →'}
            </button>
          </form>
        ) : null}

        {view === 'login' && loginStep === 'password' ? (
          /* ETAPA 2: USUÁRIO IDENTIFICADO -> PEDE A SENHA E VALIDA A LOJA */
          <form className="auth__form" onSubmit={handlePasswordLogin}>
            {/* Card com a Identificação do Usuário e da Loja */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                background: 'rgba(15, 118, 110, 0.08)',
                border: '1px solid rgba(15, 118, 110, 0.25)',
                borderRadius: '10px',
                marginBottom: '16px',
                textAlign: 'left',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: '0.74rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.6px',
                    color: 'var(--teal, #0f766e)',
                    fontWeight: 700,
                  }}
                >
                  {identifiedUser?.storeName ? `🏬 ${identifiedUser.storeName}` : 'Marthi Tecnologia'}
                </div>
                <div style={{ fontWeight: 650, fontSize: '0.94rem', color: 'var(--ink, #12151a)', marginTop: '2px' }}>
                  {identifiedUser?.name || email}
                </div>
                <div style={{ fontSize: '0.80rem', opacity: 0.75 }}>
                  {email}
                </div>
              </div>
              <button
                type="button"
                style={{
                  background: 'none',
                  border: '1px solid currentColor',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: 'var(--teal, #0f766e)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
                onClick={() => {
                  setLoginStep('email');
                  setPassword('');
                  setError(null);
                }}
                title="Digitar outro e-mail"
              >
                Alterar
              </button>
            </div>

            <label>
              Senha
              <div className="auth__password-field">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  autoFocus
                  required
                  disabled={submitting}
                />
                <button
                  type="button"
                  className="auth__password-toggle"
                  onClick={() => setShowPassword((prev) => !prev)}
                  title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                  aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </label>
            <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
              {submitting ? 'Entrando…' : 'Entre na sua conta →'}
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
                autoFocus
                required
              />
            </label>
            <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
              {submitting ? 'Enviando…' : 'Enviar pedido de redefinição'}
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
              <Link to="/parceiro">Solicitar contratação</Link>.
            </p>
          </form>
        ) : null}

        {view === 'first-access' ? (
          <form className="auth__form" onSubmit={handleFirstAccess}>
            <label>
              E-mail cadastrado
              <input
                type="email"
                name="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="voce@empresa.com.br"
                autoComplete="username"
                autoFocus
                required
                disabled={submitting}
              />
            </label>
            <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
              {submitting ? 'Verificando…' : 'Enviar link para criar senha'}
            </button>

            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'center' }}>
              <Link
                to={email ? `/criar-senha?email=${encodeURIComponent(email)}` : '/criar-senha'}
                className="btn btn--secondary btn--block"
                style={{ fontSize: '0.86rem', textAlign: 'center' }}
              >
                🔑 Já possui o Token de Ativação? Criar Senha
              </Link>
            </div>
          </form>
        ) : null}

        {view === 'login' ? (
          <>
            <div className="auth__links" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              {loginStep === 'email' ? (
                <>
                  <button type="button" className="auth__link" onClick={() => goView('forgot')}>
                    Esqueci minha senha
                  </button>
                  <button type="button" className="auth__link" onClick={() => goView('signup')}>
                    Quero me cadastrar
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="auth__link" onClick={() => goView('forgot')}>
                    Esqueci minha senha
                  </button>
                  <button
                    type="button"
                    className="auth__link"
                    onClick={() => {
                      setLoginStep('email');
                      setPassword('');
                      setError(null);
                    }}
                  >
                    ← Usar outro e-mail
                  </button>
                </>
              )}
            </div>

            {loginStep === 'email' && googleClientId && (
              <>
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
                ) : null}
              </>
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
