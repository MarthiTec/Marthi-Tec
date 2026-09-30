import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ACCESS_AREA_LABEL, pathToAccessArea } from '../../data/erpRegistry';

export function AccessDeniedPage({ pathname }: { pathname: string }) {
  const { user, logout } = useAuth();
  const area = pathToAccessArea(pathname);
  const isPainelRoot = pathname === '/painel' || pathname === '/painel/';

  function handleSwitchUser() {
    logout();
  }

  return (
    <section className="admin-page">
      <article className="admin-card admin-card--form" style={{ maxWidth: '580px', margin: '40px auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#ef4444',
              fontSize: '22px',
              fontWeight: 'bold',
            }}
          >
            !
          </span>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Acesso bloqueado</h2>
            {user?.email ? (
              <span style={{ fontSize: '0.85rem', color: 'var(--mute, #64748b)' }}>
                Conectado como: <strong>{user.email}</strong>
              </span>
            ) : null}
          </div>
        </div>

        <p style={{ lineHeight: 1.5, margin: '8px 0 12px' }}>
          Seu usuário não tem permissão para acessar{' '}
          <strong>{area ? ACCESS_AREA_LABEL[area] : 'esta área'}</strong>.
        </p>

        <p style={{ lineHeight: 1.5, fontSize: '0.9rem', color: 'var(--mute, #64748b)', margin: '0 0 20px' }}>
          Para liberar este acesso, peça a um administrador da empresa para conceder permissão em{' '}
          <strong>Operações → Usuários</strong>, vinculando o e-mail do seu login.
        </p>

        <div className="admin-toolbar admin-toolbar--stack" style={{ gap: '10px' }}>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleSwitchUser}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            Fazer login com outra conta
          </button>

          {!isPainelRoot ? (
            <Link to="/painel" className="btn btn--ghost" style={{ width: '100%', justifyContent: 'center' }}>
              Voltar ao início do painel
            </Link>
          ) : (
            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
              <Link to="/totem" className="btn btn--ghost" style={{ flex: 1, justifyContent: 'center' }}>
                Abrir Totem
              </Link>
              <Link to="/caixa" className="btn btn--ghost" style={{ flex: 1, justifyContent: 'center' }}>
                Abrir PDV / Caixa
              </Link>
            </div>
          )}
        </div>
      </article>
    </section>
  );
}
