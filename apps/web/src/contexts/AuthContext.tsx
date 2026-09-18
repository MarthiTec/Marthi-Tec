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
  fetchAuthProviders,
  fetchCurrentUser,
  loginWithGoogle as apiLoginWithGoogle,
  loginWithPassword as apiLoginWithPassword,
  type AuthProviders,
  type AuthSession,
  type AuthUser,
} from '../services/auth';

const STORAGE_KEY = 'marthi.auth.token';

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  providers: AuthProviders | null;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function applySession(
  session: AuthSession,
  setToken: (token: string | null) => void,
  setUser: (user: AuthUser | null) => void,
) {
  localStorage.setItem(STORAGE_KEY, session.token);
  setToken(session.token);
  setUser(session.user);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [providers, setProviders] = useState<AuthProviders | null>(null);
  const [loading, setLoading] = useState(true);

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
      if (!saved) {
        if (active) setLoading(false);
        return;
      }

      try {
        const current = await fetchCurrentUser(saved);
        if (active) {
          setToken(saved);
          setUser(current);
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        if (active) {
          setToken(null);
          setUser(null);
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
    applySession(session, setToken, setUser);
  }, []);

  const loginWithGoogle = useCallback(async (idToken: string) => {
    const session = await apiLoginWithGoogle(idToken);
    applySession(session, setToken, setUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      providers,
      loginWithPassword,
      loginWithGoogle,
      logout,
    }),
    [user, token, loading, providers, loginWithPassword, loginWithGoogle, logout],
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
