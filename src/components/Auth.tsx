import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiError, api } from '../api/client';
import type { SessionUser } from '../api/types';

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({ user: null, loading: true, logout: async () => undefined });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch((err: unknown) => {
        if (!(err instanceof ApiError && err.unauthorized)) console.error(err);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const logout = async () => {
    await api.logout().catch(() => undefined);
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, loading, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

export function LoginButton() {
  return (
    <a className="btn btn-primary" href={api.loginUrl()}>
      Iniciar sesión con Google
    </a>
  );
}
