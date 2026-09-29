import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';
import { useAuth } from '../contexts/AuthContext';

type TokenInfo = {
  email: string;
  name: string;
  type: string;
  expiresAt: string;
};

type Step = 'password' | 'otp' | 'success';

export function SetupPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { loginWithPassword } = useAuth();
  const token = params.get('token')?.trim() || '';

  const [loading, setLoading] = useState(true);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('password');

  // Password fields
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // OTP phone fields
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpStatus, setOtpStatus] = useState<string | null>(null);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(true);

  // Password validation checks
  const hasMinLength = password.length >= 6;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const isPasswordValid = hasMinLength && hasLetter && hasNumber && passwordsMatch;

  useEffect(() => {
    if (!token) {
      setError('Token de ativação ausente na URL. Verifique o link recebido por e-mail.');
      setLoading(false);
      return;
    }

    let isMounted = true;
    fetch(`/api/v1/auth/token/inspect?token=${encodeURIComponent(token)}&type=activation`)
      .then(async (res) => {
        const json = await res.json();
        if (!isMounted) return;
        if (res.ok && json.success) {
          setTokenInfo(json.data);
          setError(null);
        } else {
          setError(json.error?.message || 'Link de ativação inválido ou expirado.');
        }
      })
      .catch((err) => {
        if (isMounted) setError(err.message || 'Falha ao validar link de ativação.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isPasswordValid) {
      setError('Preencha os requisitos de segurança da senha.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/auth/setup-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || json.message || 'Falha ao configurar senha.');
      }

      // Automatically advance to phone confirmation / onboarding step
      setStep('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar senha.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSendOtp() {
    const clean = phone.replace(/\D/g, '');
    if (clean.length < 10) {
      setOtpStatus('Informe um número de celular válido com DDD.');
      return;
    }

    setOtpSending(true);
    setOtpStatus(null);
    try {
      const res = await fetch('/api/v1/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: clean, name: tokenInfo?.name }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || json.message || 'Falha ao enviar código.');
      }
      setOtpSent(true);
      setOtpStatus(json.data?.message || 'Código enviado via WhatsApp / SMS!');
    } catch (err) {
      setOtpStatus(err instanceof Error ? err.message : 'Erro ao enviar código.');
    } finally {
      setOtpSending(false);
    }
  }

  async function handleVerifyOtp() {
    const clean = phone.replace(/\D/g, '');
    const code = otpCode.trim();
    if (code.length !== 6) {
      setOtpStatus('O código deve conter 6 dígitos.');
      return;
    }

    setOtpVerifying(true);
    setOtpStatus(null);
    try {
      const res = await fetch('/api/v1/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: clean, code }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Código incorreto ou expirado.');
      }
      setPhoneVerified(true);
      setOtpStatus('✓ Celular confirmado com sucesso!');
    } catch (err) {
      setOtpStatus(err instanceof Error ? err.message : 'Falha ao validar código.');
    } finally {
      setOtpVerifying(false);
    }
  }

  async function handleFinishOnboarding() {
    if (!acceptTerms) {
      setError('É necessário aceitar os termos de uso para continuar.');
      return;
    }

    setSubmitting(true);
    try {
      // Try to log in directly with the newly created password
      if (tokenInfo?.email && password) {
        await loginWithPassword(tokenInfo.email, password);
        navigate('/painel', { replace: true });
        return;
      }
      setStep('success');
    } catch {
      setStep('success');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth auth--modern">
      <div className="auth__bg" aria-hidden="true" />
      <Link to="/login" className="auth__back">
        ← Ir para login
      </Link>

      <div className="auth__card" style={{ maxWidth: '520px' }}>
        <BrandLogo variant="mark" className="auth__mark" />
        <p className="auth__tenant">Marthi Tecnologia</p>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <p className="auth__lead">Validando link de ativação seguro…</p>
          </div>
        ) : error && !tokenInfo ? (
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ color: '#f87171' }}>Link Inválido ou Expirado</h1>
            <p className="auth__lead" style={{ margin: '16px 0 24px' }}>
              {error}
            </p>
            <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '24px' }}>
              Por segurança, links de criação de senha possuem uso único e prazo de expiração.
              Solicite um novo link ao administrador ou equipe de suporte.
            </p>
            <Link to="/login" className="btn btn--primary" style={{ width: '100%', display: 'inline-block' }}>
              Voltar ao Login
            </Link>
          </div>
        ) : (
          <>
            {step === 'password' && (
              <>
                <h1>Crie sua Senha de Acesso</h1>
                <p className="auth__lead">
                  Olá, <strong>{tokenInfo?.name}</strong>! Sua conta vinculada ao e-mail{' '}
                  <strong style={{ color: '#2dd4bf' }}>{tokenInfo?.email}</strong> foi confirmada.
                  Defina sua senha pessoal para ativar o acesso.
                </p>

                {error ? (
                  <p className="auth__error" role="alert">
                    {error}
                  </p>
                ) : null}

                <form className="auth__form" onSubmit={handlePasswordSubmit}>
                  <label>
                    <span>Nova Senha</span>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        autoFocus
                        required
                        style={{ paddingRight: '40px' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{
                          position: 'absolute',
                          right: '10px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          color: '#94a3b8',
                          cursor: 'pointer',
                          fontSize: '12px',
                        }}
                      >
                        {showPassword ? 'Ocultar' : 'Ver'}
                      </button>
                    </div>
                  </label>

                  <label>
                    <span>Confirmar Senha</span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repita sua senha"
                      required
                    />
                  </label>

                  {/* Checklist visual de requisitos */}
                  <div
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '8px',
                      padding: '12px 14px',
                      fontSize: '12px',
                      margin: '12px 0 16px',
                    }}
                  >
                    <p style={{ margin: '0 0 6px', fontWeight: 600, color: '#94a3b8' }}>Requisitos de segurança:</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ color: hasMinLength ? '#4ade80' : '#94a3b8' }}>
                        {hasMinLength ? '✓' : '○'} Mínimo de 6 caracteres
                      </span>
                      <span style={{ color: hasLetter ? '#4ade80' : '#94a3b8' }}>
                        {hasLetter ? '✓' : '○'} Pelo menos uma letra
                      </span>
                      <span style={{ color: hasNumber ? '#4ade80' : '#94a3b8' }}>
                        {hasNumber ? '✓' : '○'} Pelo menos um número
                      </span>
                      <span style={{ color: passwordsMatch ? '#4ade80' : '#94a3b8' }}>
                        {passwordsMatch ? '✓' : '○'} As senhas coincidem
                      </span>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="btn btn--primary"
                    disabled={!isPasswordValid || submitting}
                    style={{ width: '100%' }}
                  >
                    {submitting ? 'Salvando senha…' : 'Definir Senha e Avançar →'}
                  </button>
                </form>
              </>
            )}

            {step === 'otp' && (
              <>
                <div style={{ display: 'inline-block', background: 'rgba(45,212,191,0.15)', color: '#2dd4bf', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px' }}>
                  Etapa 2 · Verificação de Segurança
                </div>
                <h1>Confirmação do Celular</h1>
                <p className="auth__lead">
                  Sua senha foi criada com sucesso! Para garantir a segurança da conta, confirme seu
                  número de WhatsApp ou celular para recuperação futura.
                </p>

                {otpStatus ? (
                  <p className={phoneVerified ? 'auth__ok' : 'auth__error'} role="status">
                    {otpStatus}
                  </p>
                ) : null}

                <div className="auth__form">
                  <label>
                    <span>Celular / WhatsApp</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="(00) 00000-0000"
                        disabled={phoneVerified}
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={handleSendOtp}
                        disabled={otpSending || phoneVerified}
                        style={{ whiteSpace: 'nowrap' }}
                      >
                        {otpSending ? 'Enviando…' : otpSent ? 'Reenviar' : 'Enviar Código'}
                      </button>
                    </div>
                  </label>

                  {otpSent && !phoneVerified && (
                    <label>
                      <span>Código de 6 dígitos recebido</span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value)}
                          placeholder="Ex: 123456"
                          style={{ letterSpacing: '4px', textAlign: 'center', fontSize: '18px', fontWeight: 700 }}
                        />
                        <button
                          type="button"
                          className="btn btn--primary"
                          onClick={handleVerifyOtp}
                          disabled={otpVerifying || otpCode.length !== 6}
                        >
                          {otpVerifying ? 'Validando…' : 'Validar'}
                        </button>
                      </div>
                    </label>
                  )}

                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginTop: '12px' }}>
                    <input
                      type="checkbox"
                      checked={acceptTerms}
                      onChange={(e) => setAcceptTerms(e.target.checked)}
                      style={{ width: 'auto', margin: 0 }}
                    />
                    <span style={{ fontSize: '12px', color: '#cbd5e1' }}>
                      Li e concordo com os Termos de Uso e Política de Privacidade da Marthi Tecnologia.
                    </span>
                  </label>

                  <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={handleFinishOnboarding}
                      disabled={submitting}
                      style={{ flex: 1 }}
                    >
                      {submitting ? 'Entrando…' : 'Concluir e Acessar Sistema →'}
                    </button>
                  </div>
                </div>
              </>
            )}

            {step === 'success' && (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎉</div>
                <h1 style={{ color: '#4ade80' }}>Conta Ativada com Sucesso!</h1>
                <p className="auth__lead" style={{ margin: '16px 0 24px' }}>
                  Sua senha foi configurada e seu acesso está liberado na Marthi Tecnologia.
                </p>
                <Link to="/login" className="btn btn--primary" style={{ width: '100%', display: 'inline-block' }}>
                  Fazer Login Agora →
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
