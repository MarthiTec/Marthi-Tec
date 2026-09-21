import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { OperatorAccountPage } from '../shared/OperatorAccountPage';
import './admin.css';

/** Perfil no painel — mesma tela dos demais módulos. */
export function ProfilePage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <section className="admin-page">
        <p className="empty">Carregando perfil…</p>
      </section>
    );
  }

  if (!user) {
    return <Navigate to="/login?next=/painel/perfil" replace />;
  }

  return <OperatorAccountPage />;
}
