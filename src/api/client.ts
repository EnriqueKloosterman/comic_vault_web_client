import type { CatalogItem, CatalogPage, ComicManifest, ReadingState, Rfc7807Error, SessionUser } from './types';

const BASE: string = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(readonly body: Rfc7807Error) {
    super(body.message);
    this.status = body.statusCode;
    this.code = body.code;
  }
  get unauthorized(): boolean {
    return this.status === 401;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { credentials: 'include', ...init });
  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok) {
    if (contentType.includes('json')) throw new ApiError((await res.json()) as Rfc7807Error);
    throw new Error(`HTTP ${res.status} en ${path}`);
  }
  return (await res.json()) as T;
}

export interface CatalogFilters {
  status?: string;
  favorite?: boolean;
  series?: string;
  page?: number;
  limit?: number;
}

export const api = {
  me: () => request<SessionUser>('/api/auth/me'),
  logout: () =>
    request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }).finally(() => undefined),
  loginUrl: () => `${BASE}/api/auth/google`,

  catalog: (f: CatalogFilters = {}) => {
    const q = new URLSearchParams();
    if (f.status) q.set('status', f.status);
    if (f.favorite !== undefined) q.set('favorite', String(f.favorite));
    if (f.series) q.set('series', f.series);
    q.set('page', String(f.page ?? 1));
    q.set('limit', String(f.limit ?? 24));
    return request<CatalogPage>(`/api/comics?${q.toString()}`);
  },

  manifest: (id: string) => request<ComicManifest>(`/api/comics/${id}/manifest`),
  history: () => request<ReadingState[]>('/api/reading-history'),
  syncDrive: () => request<{ added: number; kept: number; archived: number }>('/api/sync/drive', { method: 'POST' }),

  patchProgress: (id: string, currentPage: number, isRewind = false) =>
    request<ReadingState>(`/api/comics/${id}/progress`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPage, isRewind }),
    }),

  patchFavorite: (id: string, isFavorite: boolean) =>
    request<ReadingState>(`/api/comics/${id}/favorite`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isFavorite }),
    }),

  pageUrl: (id: string, index: number) => `${BASE}/api/comics/${id}/pages/${index}`,
  coverUrl: (id: string) => `${BASE}/api/comics/${id}/cover`,
};

export type { CatalogItem };
