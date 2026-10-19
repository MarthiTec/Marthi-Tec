import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  fetchAccess,
  fetchCurrentUser,
  fetchStores,
  loginWithPassword as apiLogin,
} from '../api/authApi';
import { ApiError } from '../api/client';
import type { AccessContext, AuthUser, StoreRow } from '../api/types';
import {
  clearSession,
  readActiveStoreId,
  readToken,
  saveActiveStoreId,
  saveToken,
} from './sessionStorage';

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  stores: StoreRow[];
  storeId: string | null;
  access: AccessContext | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setStoreId: (storeId: string) => Promise<void>;
  refreshAccess: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function pickDefaultStore(stores: StoreRow[], preferred: string | null): string | null {
  if (!stores.length) return null;
  if (preferred && stores.some((s) => s.id === preferred && s.active !== false)) return preferred;
  const matrix = stores.find((s) => s.isMatrix && s.active !== false);
  if (matrix) return matrix.id;
  const active = stores.find((s) => s.active !== false);
  return (active ?? stores[0]).id;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [storeId, setStoreIdState] = useState<string | null>(null);
  const [access, setAccess] = useState<AccessContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadForSession = useCallback(async (sessionToken: string, preferredStore: string | null) => {
    const current = await fetchCurrentUser(sessionToken);
    const list = await fetchStores(sessionToken);
    const nextStore = pickDefaultStore(list, preferredStore);
    let nextAccess: AccessContext | null = null;
    if (nextStore) {
      nextAccess = await fetchAccess(sessionToken, nextStore);
      await saveActiveStoreId(nextStore);
    }
    setUser(current);
    setToken(sessionToken);
    setStores(list);
    setStoreIdState(nextStore);
    setAccess(nextAccess);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const saved = await readToken();
        if (!saved) {
          if (active) setLoading(false);
          return;
        }
        const preferred = await readActiveStoreId();
        await loadForSession(saved, preferred);
      } catch (err) {
        await clearSession();
        if (active) {
          setUser(null);
          setToken(null);
          setStores([]);
          setStoreIdState(null);
          setAccess(null);
          setError(err instanceof Error ? err.message : 'Sessão expirada.');
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [loadForSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      setError(null);
      const session = await apiLogin(email, password);
      await saveToken(session.token);
      const preferred = await readActiveStoreId();
      await loadForSession(session.token, preferred);
    },
    [loadForSession],
  );

  const logout = useCallback(async () => {
    await clearSession();
    setUser(null);
    setToken(null);
    setStores([]);
    setStoreIdState(null);
    setAccess(null);
    setError(null);
  }, []);

  const setStoreId = useCallback(
    async (nextId: string) => {
      if (!token) return;
      setError(null);
      try {
        const nextAccess = await fetchAccess(token, nextId);
        await saveActiveStoreId(nextId);
        setStoreIdState(nextId);
        setAccess(nextAccess);
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Falha ao trocar loja.';
        setError(message);
        throw err;
      }
    },
    [token],
  );

  const refreshAccess = useCallback(async () => {
    if (!token || !storeId) return;
    const nextAccess = await fetchAccess(token, storeId);
    setAccess(nextAccess);
  }, [token, storeId]);

  const value = useMemo(
    () => ({
      user,
      token,
      stores,
      storeId,
      access,
      loading,
      error,
      login,
      logout,
      setStoreId,
      refreshAccess,
    }),
    [user, token, stores, storeId, access, loading, error, login, logout, setStoreId, refreshAccess],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fora de AuthProvider');
  return ctx;
}
