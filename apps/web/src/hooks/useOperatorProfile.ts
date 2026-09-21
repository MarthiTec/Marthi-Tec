import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getOperatorProfile,
  PROFILE_EVENT,
  resolveProfilePhoto,
  type OperatorProfile,
} from '../data/operatorProfile';

export function useOperatorProfile() {
  const { user } = useAuth();
  const fallback = user?.name ?? 'Operador';
  const fallbackEmail = user?.email ?? '';
  const [profile, setProfile] = useState<OperatorProfile>(() =>
    getOperatorProfile(fallback, fallbackEmail),
  );

  useEffect(() => {
    setProfile(getOperatorProfile(fallback, fallbackEmail));
  }, [fallback, fallbackEmail]);

  useEffect(() => {
    function refresh() {
      setProfile(getOperatorProfile(fallback, fallbackEmail));
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
