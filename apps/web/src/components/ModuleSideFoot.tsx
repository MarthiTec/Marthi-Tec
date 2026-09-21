import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { userIsStoreAdmin } from '../data/erpRegistry';
import { AdminIcon } from './AdminIcons';
import './moduleChrome.css';

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
