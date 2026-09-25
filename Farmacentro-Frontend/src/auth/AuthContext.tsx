import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, http, setSessionListeners } from '../api/http';
import type { SessionInfo } from '../api/types';

type AuthStatus = 'loading' | 'anonymous' | 'mfa' | 'authenticated';

interface AuthState {
  status: AuthStatus;
  session: SessionInfo | null;
  mfaMethods: string[];
  sessionExpiresAt: string | null;
  endedReason: 'logout' | 'expired' | null;
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  completeLogin: (session: SessionInfo) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** The session state lives only in memory; the server is the source of truth (GET /auth/me). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    session: null,
    mfaMethods: [],
    sessionExpiresAt: null,
    endedReason: null,
  });

  const endSession = useCallback((reason: 'logout' | 'expired') => {
    setState({ status: 'anonymous', session: null, mfaMethods: [], sessionExpiresAt: null, endedReason: reason });
  }, []);

  useEffect(() => {
    setSessionListeners(
      (expiresAt) => setState((s) => (s.status === 'authenticated' ? { ...s, sessionExpiresAt: expiresAt } : s)),
      () => setState((s) => (s.status === 'authenticated' ? { ...s, status: 'anonymous', session: null, endedReason: 'expired' } : s)),
    );
    return () => setSessionListeners(null, null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const session = await http.get<SessionInfo>('/auth/me');
      setState({ status: 'authenticated', session, mfaMethods: [], sessionExpiresAt: session.sessionExpiresAt, endedReason: null });
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setState((s) => ({ ...s, status: 'anonymous', session: null }));
        return;
      }
      throw error;
    }
  }, []);

  useEffect(() => {
    refresh().catch(() => setState((s) => ({ ...s, status: 'anonymous' })));
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    const result = await http.post<{ next: 'mfa'; methods: string[] }>('/auth/login', { username, password });
    setState({ status: 'mfa', session: null, mfaMethods: result.methods, sessionExpiresAt: null, endedReason: null });
  }, []);

  const completeLogin = useCallback((session: SessionInfo) => {
    setState({ status: 'authenticated', session, mfaMethods: [], sessionExpiresAt: session.sessionExpiresAt, endedReason: null });
  }, []);

  const logout = useCallback(async () => {
    try {
      await http.post('/auth/logout');
    } finally {
      endSession('logout');
    }
  }, [endSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      completeLogin,
      refresh,
      logout,
      can: (permission: string) => state.session?.permissions.includes(permission) ?? false,
    }),
    [state, login, completeLogin, refresh, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
