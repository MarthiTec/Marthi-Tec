import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { userIsStoreAdmin } from '../data/erpRegistry';
import { AdminIcon } from './AdminIcons';
import './moduleChrome.css';

/** Rodapé do menu lateral dos apps: atalho ao painel (só gestor). Log-out fica no diálogo de Sair. */
export function ModuleSideFoot() {
  const { user } = useAuth();
  if (!userIsStoreAdmin(user?.email)) return null;

  return (
    <div className="module-side-foot">
      <NavLink to="/painel" className="module-side-foot__link">
        <AdminIcon name="home" />
        <span>Abrir Painel</span>
      </NavLink>
    </div>
  );
}
