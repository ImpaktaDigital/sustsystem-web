import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, refreshSession, session, type TokenResponse } from '../api/client';
import type { Me } from '../api/types';
import type { Permission } from '../lib/shared';

type Status = 'loading' | 'authenticated' | 'anonymous';

export interface SignupInput {
  organizationName: string;
  organizationDocument?: string;
  name: string;
  email: string;
  password: string;
}

interface AuthValue {
  status: Status;
  me: Me | null;
  login(email: string, password: string): Promise<void>;
  signup(input: SignupInput): Promise<void>;
  logout(): Promise<void>;
  switchOrganization(organizationId: string): Promise<void>;
  reload(): Promise<void>;
  can(...permissions: Permission[]): boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const [me, setMe] = useState<Me | null>(null);

  const loadMe = useCallback(async () => {
    const data = await api.get<Me>('/auth/me');
    setMe(data);
    setStatus('authenticated');
  }, []);

  const reset = useCallback(() => {
    session.clear();
    setMe(null);
    setStatus('anonymous');
    queryClient.clear();
  }, [queryClient]);

  // Restaura a sessão ao abrir a aplicação
  useEffect(() => {
    (async () => {
      if (session.hasRefreshToken() && (await refreshSession())) {
        try {
          await loadMe();
          return;
        } catch { /* sessão inválida */ }
      }
      reset();
    })();
    return session.onExpired(reset);
  }, [loadMe, reset]);

  const startSession = useCallback(
    async (tokens: TokenResponse) => {
      queryClient.clear();
      session.store(tokens);
      await loadMe();
    },
    [loadMe, queryClient],
  );

  const value = useMemo<AuthValue>(
    () => ({
      status,
      me,
      login: async (email, password) => startSession(await api.post<TokenResponse>('/auth/login', { email, password }, false)),
      signup: async (input) => startSession(await api.post<TokenResponse>('/auth/signup', input, false)),
      logout: async () => {
        try { await api.post('/auth/logout'); } catch { /* já expirada */ }
        reset();
      },
      switchOrganization: async (organizationId) =>
        startSession(await api.post<TokenResponse>('/auth/switch-organization', { organizationId })),
      reload: loadMe,
      can: (...permissions) => !!me && permissions.every((p) => me.permissions.includes(p)),
    }),
    [status, me, startSession, reset, loadMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}
