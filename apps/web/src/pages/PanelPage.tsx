import { Link, Navigate } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';
import { useAuth } from '../contexts/AuthContext';

export function PanelPage() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="panel-shell panel-shell--loading">
        <p>Carregando…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="panel-shell">
      <header className="panel-shell__top">
        <Link to="/" aria-label="Ir para a home">
          <BrandLogo variant="mark" className="panel-shell__mark" />
        </Link>
        <div className="panel-shell__meta">
          <strong>Sua Loja · Painel</strong>
          <span>
            {user.name} · {user.provider === 'google' ? 'Google' : 'E-mail'}
          </span>
        </div>
        <button type="button" className="btn btn--ghost" onClick={logout}>
          Sair
        </button>
      </header>

      <main className="panel-shell__body">
        <div className="panel-shell__user">
          {user.picture ? (
            <img src={user.picture} alt="" className="panel-shell__avatar" />
          ) : (
            <div className="panel-shell__avatar panel-shell__avatar--fallback">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <h1>Olá, {user.name.split(' ')[0]}</h1>
            <p>{user.email}</p>
          </div>
        </div>

        <p className="panel-shell__note">
          Login pronto. Na próxima etapa montamos os módulos operacionais (produtos, preços e
          totem).
        </p>
      </main>
    </div>
  );
}
