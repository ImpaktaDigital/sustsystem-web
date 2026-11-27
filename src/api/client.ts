/**
 * Cliente HTTP da API.
 * - Access token (15 min) só em memória.
 * - Refresh token em localStorage, para manter a sessão entre recarregamentos. É rotativo: cada uso gera um novo.
 *   Por ora a API e a Web ficam em domínios diferentes (Render/Vercel); um cookie httpOnly fica para quando
 *   ambos estiverem no mesmo domínio.
 * - Em 401, renova o token uma única vez (requisições simultâneas compartilham a mesma renovação).
 */

export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3333').replace(/\/$/, '');
const REFRESH_KEY = 'sustsystem.refreshToken';

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  organizationId: string;
  role: string;
  permissions: string[];
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

const storage = {
  get: () => {
    try { return localStorage.getItem(REFRESH_KEY); } catch { return null; }
  },
  set: (v: string | null) => {
    try { v ? localStorage.setItem(REFRESH_KEY, v) : localStorage.removeItem(REFRESH_KEY); } catch { /* sem storage */ }
  },
};

export const session = {
  hasRefreshToken: () => !!storage.get(),
  store(tokens: TokenResponse) {
    accessToken = tokens.accessToken;
    storage.set(tokens.refreshToken);
  },
  clear() {
    accessToken = null;
    storage.set(null);
  },
  /** Notificado quando a sessão expira e não pode ser renovada. */
  onExpired(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};

async function refresh(): Promise<boolean> {
  const refreshToken = storage.get();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) throw new Error();
    session.store(await res.json());
    return true;
  } catch {
    session.clear();
    return false;
  }
}

export function refreshSession() {
  refreshing ??= refresh().finally(() => (refreshing = null));
  return refreshing;
}

function errorMessage(body: unknown, status: number) {
  const msg = (body as { message?: string | string[] })?.message;
  if (Array.isArray(msg)) return msg.join('; ');
  if (msg) return msg;
  if (status === 0) return 'Não foi possível conectar à API';
  if (status >= 500) return 'Erro no servidor. Tente novamente em instantes.';
  return 'Não foi possível concluir a operação';
}

interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  auth?: boolean;
}

export async function request<T>(method: string, path: string, opts: RequestOptions = {}, retry = true): Promise<T> {
  const { body, query, auth = true } = opts;
  const qs = query
    ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])).toString()
    : '';

  if (auth && !accessToken && storage.get()) await refreshSession();

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/v1${path}${qs === '?' ? '' : qs}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(auth && accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, errorMessage(null, 0));
  }

  if (res.status === 401 && auth && retry) {
    if (await refreshSession()) return request<T>(method, path, opts, false);
    listeners.forEach((fn) => fn());
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new ApiError(res.status, errorMessage(data, res.status), data);
  return data as T;
}

/** Baixa um arquivo da API (com autenticação) e dispara o download no navegador. */
export async function download(path: string, query?: RequestOptions['query'], retry = true): Promise<void> {
  if (!accessToken && storage.get()) await refreshSession();
  const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)])).toString() : '';
  const res = await fetch(`${API_URL}/api/v1${path}${qs}`, { headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {} });
  if (res.status === 401 && retry && (await refreshSession())) return download(path, query, false);
  if (!res.ok) {
    const text = await res.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = undefined; }
    throw new ApiError(res.status, errorMessage(body, res.status), body);
  }
  const name = res.headers.get('content-disposition')?.match(/filename="?([^"]+)"?/)?.[1] ?? 'arquivo';
  const url = URL.createObjectURL(await res.blob());
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query']) => request<T>('GET', path, { query }),
  post: <T>(path: string, body?: unknown, auth = true) => request<T>('POST', path, { body, auth }),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, { body }),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, { body }),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
