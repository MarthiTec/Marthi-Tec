import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';

type TokenInfo = {
  email: string;
  name: string;
  type: string;
  expiresAt: string;
};

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token')?.trim() || '';

  const [loading, setLoading] = useState(true);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Requirements
  const hasMinLength = password.length >= 6;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const isPasswordValid = hasMinLength && hasLetter && hasNumber && passwordsMatch;

  useEffect(() => {
    if (!token) {
      setError('Token de recuperação não fornecido.');
      setLoading(false);
      return;
    }

    let isMounted = true;
    fetch(`/api/v1/auth/token/inspect?token=${encodeURIComponent(token)}&type=password_reset`)
      .then(async (res) => {
        const json = await res.json();
        if (!isMounted) return;
        if (res.ok && json.success) {
          setTokenInfo(json.data);
          setError(null);
        } else {
          setError(json.error?.message || 'Link de recuperação inválido ou expirado.');
        }
      })
      .catch((err) => {
        if (isMounted) setError(err.message || 'Erro ao validar link.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isPasswordValid) {
      setError('A senha não cumpre os requisitos de segurança.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Não foi possível redefinir sua senha.');
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao redefinir senha.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth auth--modern">
      <div className="auth__bg" aria-hidden="true" />
      <Link to="/login" className="auth__back">
        ← Voltar ao login
      </Link>

      <div className="auth__card" style={{ maxWidth: '480px' }}>
        <BrandLogo variant="mark" className="auth__mark" />
        <p className="auth__tenant">Marthi Tecnologia</p>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <p className="auth__lead">Validando link de redefinição seguro…</p>
          </div>
        ) : error && !tokenInfo ? (
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ color: '#f87171' }}>Link Inválido ou Expirado</h1>
            <p className="auth__lead" style={{ margin: '16px 0 24px' }}>
              {error}
            </p>
            <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '24px' }}>
              Por segurança, links de redefinição são de uso único e expiram após 2 horas.
            </p>
            <Link to="/login?view=forgot" className="btn btn--primary" style={{ width: '100%', display: 'inline-block' }}>
              Solicitar Novo Link de Redefinição
            </Link>
          </div>
        ) : success ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: '44px', marginBottom: '12px' }}>🔒✓</div>
            <h1 style={{ color: '#4ade80' }}>Senha Redefinida!</h1>
            <p className="auth__lead" style={{ margin: '16px 0 24px' }}>
              Sua senha foi atualizada com sucesso. Você já pode acessar sua conta.
            </p>
            <Link to="/login" className="btn btn--primary" style={{ width: '100%', display: 'inline-block' }}>
              Ir para o Login →
            </Link>
          </div>
        ) : (
          <>
            <h1>Redefinir Senha</h1>
            <p className="auth__lead">
              Olá, <strong>{tokenInfo?.name}</strong>. Crie uma nova senha para a conta{' '}
              <strong style={{ color: '#2dd4bf' }}>{tokenInfo?.email}</strong>.
            </p>

            {error ? (
              <p className="auth__error" role="alert">
                {error}
              </p>
            ) : null}

            <form className="auth__form" onSubmit={handleSubmit}>
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
                <span>Confirmar Nova Senha</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita sua nova senha"
                  required
                />
              </label>

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
                    {hasLetter ? '✓' : '○'} Ao menos uma letra
                  </span>
                  <span style={{ color: hasNumber ? '#4ade80' : '#94a3b8' }}>
                    {hasNumber ? '✓' : '○'} Ao menos um número
                  </span>
                  <span style={{ color: passwordsMatch ? '#4ade80' : '#94a3b8' }}>
                    {passwordsMatch ? '✓' : '○'} Senhas conferem
                  </span>
                </div>
              </div>

              <button
                type="submit"
                className="btn btn--primary"
                disabled={!isPasswordValid || submitting}
                style={{ width: '100%' }}
              >
                {submitting ? 'Salvando…' : 'Redefinir Minha Senha'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
