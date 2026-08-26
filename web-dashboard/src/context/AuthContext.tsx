import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  clearSession,
  clearToken,
  decodeJwtPayload,
  getSession,
  getToken,
  setBlockedHandler,
  setSession as persistSession,
  setToken as persistToken,
  setUnauthorizedHandler,
} from '../api/client';
import type { AuthResponse, AuthSession, JwtPayload } from '../api/types';

interface AuthContextValue {
  token: string | null;
  session: AuthSession | null;
  /**
   * The clinic is billing-blocked: management is withheld, but alerting and the
   * clinic's own "Obuna" screen stay fully usable. Purely informational — nothing
   * routes off this, it only drives the banner and the per-tab notices.
   */
  blocked: boolean;
  setBlocked: (blocked: boolean) => void;
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
  const [blocked, setBlocked] = useState(false);

  const login = useCallback((auth: AuthResponse) => {
    persistToken(auth.access_token);
    persistSession({ role: auth.role, name: auth.name, clinic_id: auth.clinic_id });
    setBlocked(false);
    setTokenState(auth.access_token);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    clearSession();
    setBlocked(false);
    setTokenState(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setTokenState(null));
    setBlockedHandler((next) => setBlocked(next));
    return () => {
      setUnauthorizedHandler(null);
      setBlockedHandler(null);
    };
  }, []);

  const session = useMemo<AuthSession | null>(() => {
    if (!token) return null;
    // role/clinic_id must always come from the signed JWT, never from the plain
    // localStorage session blob: that blob is ordinary unsigned JSON a user can
    // rewrite in devtools to render a higher-privilege layout client-side (the
    // backend independently re-derives role from the JWT on every request, so this
    // was only a UI-structure disclosure, not a data leak -- but it's a cheap,
    // worthwhile guard). The cached session is only trusted for cosmetic display
    // fields (name) that carry no authorization weight.
    const p = decodeJwtPayload<JwtPayload>(token);
    if (!p) return null;
    const stored = getSession();
    const name = stored && stored.role === p.role ? stored.name : p.name || p.email || '';
    return { role: p.role, name, clinic_id: p.clinic_id ?? null };
  }, [token]);

  const value = useMemo(
    () => ({ token, session, blocked, setBlocked, login, logout }),
    [token, session, blocked, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
