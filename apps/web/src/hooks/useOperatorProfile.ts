import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { userIsStoreAdmin } from '../data/erpRegistry';
import {
  getOperatorProfile,
  PROFILE_EVENT,
  resolveProfilePhoto,
  type OperatorProfile,
} from '../data/operatorProfile';

export function useOperatorProfile() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || userIsStoreAdmin(user?.email);
  const fallbackRole = isAdmin ? 'Administrador' : user?.role === 'manager' ? 'Gerente' : 'Operador';
  const fallback = user?.name ?? (isAdmin ? 'Administrador' : 'Operador');
  const fallbackEmail = user?.email ?? '';
  const [profile, setProfile] = useState<OperatorProfile>(() =>
    getOperatorProfile(fallback, fallbackEmail, fallbackRole),
  );

  useEffect(() => {
    setProfile(getOperatorProfile(fallback, fallbackEmail, fallbackRole));
  }, [fallback, fallbackEmail, fallbackRole]);

  useEffect(() => {
    function refresh() {
      setProfile(getOperatorProfile(fallback, fallbackEmail, fallbackRole));
    }
    window.addEventListener(PROFILE_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(PROFILE_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [fallback, fallbackEmail]);

  const photo = resolveProfilePhoto(profile, user?.picture);

  return {
    profile,
    photo,
    email: user?.email ?? '',
    fallbackName: fallback,
  };
}
