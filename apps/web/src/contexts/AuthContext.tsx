import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { logAccess } from '../data/auditLog';
import { markStoreContracted } from '../data/demoLeadStore';
import { bootstrapErpFromApi } from '../data/erpBootstrap';
import {
  fetchAuthProviders,
  fetchCurrentUser,
  loginWithGoogle as apiLoginWithGoogle,
  loginWithPassword as apiLoginWithPassword,
  type AuthProviders,
  type AuthSession,
  type AuthUser,
} from '../services/auth';

const STORAGE_KEY = 'marthi.auth.token';
const LEGACY_DEMO_TOKEN = 'marthi-demo-token';

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  erpReady: boolean;
  erpError: string | null;
  providers: AuthProviders | null;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => void;
  refreshErp: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function applySession(
  session: AuthSession,
  setToken: (token: string | null) => void,
  setUser: (user: AuthUser | null) => void,
  setErpReady: (ready: boolean) => void,
  setErpError: (error: string | null) => void,
) {
  localStorage.setItem(STORAGE_KEY, session.token);
  setToken(session.token);
  setUser(session.user);
  markStoreContracted();
  logAccess({
    actorName: session.user.name,
    actorEmail: session.user.email,
    action: 'login',
  });
  const ok = await bootstrapErpFromApi();
  setErpReady(ok);
  setErpError(ok ? null : 'Não foi possível sincronizar o ERP. Tentaremos de novo.');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === LEGACY_DEMO_TOKEN) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return saved;
  });
  const [user, setUser] = useState<AuthUser | null>(null);
  const [providers, setProviders] = useState<AuthProviders | null>(null);
  const [loading, setLoading] = useState(true);
  const [erpReady, setErpReady] = useState(false);
  const [erpError, setErpError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const available = await fetchAuthProviders();
        if (active) setProviders(available);
      } catch {
        if (active) {
          setProviders({
            google: Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID),
            password: false,
            googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? null,
          });
        }
      }

      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved || saved === LEGACY_DEMO_TOKEN) {
        localStorage.removeItem(STORAGE_KEY);
        if (active) {
          setToken(null);
          setLoading(false);
        }
        return;
      }

      try {
        const current = await fetchCurrentUser(saved);
        if (active) {
          setToken(saved);
          setUser(current);
        }
        const ok = await bootstrapErpFromApi();
        if (active) {
          setErpReady(ok);
          setErpError(ok ? null : 'Não foi possível sincronizar o ERP.');
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        if (active) {
          setToken(null);
          setUser(null);
          setErpReady(false);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void bootstrap();
    return () => {
      active = false;
    };
  }, []);

  const loginWithPassword = useCallback(async (email: string, password: string) => {
    const session = await apiLoginWithPassword(email, password);
    await applySession(session, setToken, setUser, setErpReady, setErpError);
  }, []);

  const loginWithGoogle = useCallback(async (idToken: string) => {
    const session = await apiLoginWithGoogle(idToken);
    await applySession(session, setToken, setUser, setErpReady, setErpError);
  }, []);

  const logout = useCallback(() => {
    if (user) {
      logAccess({
        actorName: user.name,
        actorEmail: user.email,
        action: 'logout',
      });
    }
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setUser(null);
    setErpReady(false);
    setErpError(null);
  }, [user]);

  const refreshErp = useCallback(async () => {
    const ok = await bootstrapErpFromApi();
    setErpReady(ok);
    setErpError(ok ? null : 'Não foi possível sincronizar o ERP.');
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      erpReady,
      erpError,
      providers,
      loginWithPassword,
      loginWithGoogle,
      logout,
      refreshErp,
    }),
    [
      user,
      token,
      loading,
      erpReady,
      erpError,
      providers,
      loginWithPassword,
      loginWithGoogle,
      logout,
      refreshErp,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return ctx;
}
