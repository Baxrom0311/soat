import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  clearSession,
  clearToken,
  decodeJwtPayload,
  getSession,
  getToken,
  setSession as persistSession,
  setSuspendedHandler,
  setToken as persistToken,
  setUnauthorizedHandler,
} from '../api/client';
import type { AuthResponse, AuthSession, JwtPayload } from '../api/types';

interface AuthContextValue {
  token: string | null;
  session: AuthSession | null;
  suspended: boolean;
  login: (auth: AuthResponse) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => {
    const stored = getToken();
    if (!stored) return null;
    // An expired token would render the dashboard for a flash, 401 on the first
    // request and silently bounce to login — check exp up front instead.
    const payload = decodeJwtPayload<JwtPayload>(stored);
    if (payload?.exp && payload.exp * 1000 <= Date.now()) {
      clearToken();
      clearSession();
      return null;
    }
    return stored;
  });
  const [suspended, setSuspended] = useState(false);

  const login = useCallback((auth: AuthResponse) => {
    persistToken(auth.access_token);
    persistSession({ role: auth.role, name: auth.name, clinic_id: auth.clinic_id });
    setSuspended(false);
    setTokenState(auth.access_token);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    clearSession();
    setSuspended(false);
    setTokenState(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setTokenState(null));
    setSuspendedHandler(() => setSuspended(true));
    return () => {
      setUnauthorizedHandler(null);
      setSuspendedHandler(null);
    };
  }, []);

  const session = useMemo<AuthSession | null>(() => {
    if (!token) return null;
    const stored = getSession();
    if (stored) return stored;
    // Sessions created before role/name were persisted: fall back to JWT claims.
    const p = decodeJwtPayload<JwtPayload>(token);
    return p ? { role: p.role, name: p.name || p.email || '', clinic_id: p.clinic_id ?? null } : null;
  }, [token]);

  const value = useMemo(
    () => ({ token, session, suspended, login, logout }),
    [token, session, suspended, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
