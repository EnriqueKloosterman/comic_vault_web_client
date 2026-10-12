import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import type { CatalogItem } from '../api/types';
import { LoginButton, useAuth } from '../components/Auth';
import { ComicCard } from '../components/ComicCard';
import { ThemeToggle } from '../components/Theme';
import { useToast } from '../components/Toast';
import { CardSkeleton, Spinner } from '../components/ui';

const STATUSES = [
  { value: '', label: 'Todos' },
  { value: 'unread', label: 'Sin leer' },
  { value: 'reading', label: 'Leyendo' },
  { value: 'completed', label: 'Completados' },
  { value: 'archived', label: 'Archivados' },
];

function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export default function Library({ initialSeries = '' }: { initialSeries?: string }) {
  const { user, loading: authLoading, logout } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState('');
  const [favOnly, setFavOnly] = useState(false);
  const [series, setSeries] = useState(initialSeries);
  const debouncedSeries = useDebouncedValue(series, 400);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.catalog({
        status: status || undefined,
        favorite: favOnly || undefined,
        series: debouncedSeries || undefined,
        page,
        limit: 24,
      });
      setItems(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err) {
      if (err instanceof ApiError && err.unauthorized) return;
      setError(err instanceof Error ? err.message : 'Error cargando biblioteca');
    } finally {
      setLoading(false);
    }
  }, [status, favOnly, debouncedSeries, page]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await api.syncDrive();
      toast.push('success', `Sync OK: ${r.added} nuevos · ${r.kept} conservados · ${r.archived} archivados`);
      await load();
    } catch (err) {
      toast.push('error', err instanceof Error ? `Sync fallido: ${err.message}` : 'Sync fallido');
    } finally {
      setSyncing(false);
    }
  };

  if (authLoading) {
    return (
      <main>
        <Spinner label="Verificando sesión…" />
      </main>
    );
  }
  if (!user) {
    return (
      <main>
        <div className="login-hero">
          <div className="login-logo" aria-hidden="true">
            CV
          </div>
          <h1>ComicVault</h1>
          <p>Tus cómics de Drive, indexados y listos para leer.</p>
          <LoginButton />
        </div>
      </main>
    );
  }

  const pageNumbers = Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
    if (totalPages <= 7) return i + 1;
    const start = Math.max(1, Math.min(page - 3, totalPages - 6));
    return start + i;
  });

  return (
    <main>
      <header className="topbar">
        <Link to="/" className="brand">
          Comic<span className="brand-accent">Vault</span>
        </Link>
        <nav>
          <ThemeToggle />
          <Link to="/history">Historial</Link>
          <button type="button" className="btn btn-primary btn-sm" onClick={sync} disabled={syncing}>
            {syncing && <Spinner label="Sincronizando" />}
            {syncing ? 'Sincronizando…' : 'Sync Drive'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
            Salir
          </button>
          <span className="user-email">{user.email}</span>
        </nav>
      </header>

      <section className="filters" aria-label="Filtros de biblioteca">
        <div className="segmented" role="group" aria-label="Estado">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={status === s.value}
              onClick={() => {
                setStatus(s.value);
                setPage(1);
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={favOnly}
            onChange={(e) => {
              setFavOnly(e.target.checked);
              setPage(1);
            }}
          />
          Favoritos
        </label>
        <input
          type="search"
          className="field"
          placeholder="Buscar serie…"
          aria-label="Buscar por serie"
          value={series}
          onChange={(e) => {
            setSeries(e.target.value);
            setPage(1);
          }}
        />
        {total > 0 && <span className="card-meta">{total} título(s)</span>}
      </section>

      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <section className="grid" aria-label="Cargando biblioteca">
          {Array.from({ length: 8 }, (_, i) => (
            <CardSkeleton key={i} />
          ))}
        </section>
      ) : items.length === 0 ? (
        <div className="empty">
          <strong>{total === 0 && !status && !favOnly && !debouncedSeries ? 'Biblioteca vacía' : 'Sin resultados'}</strong>
          {total === 0 && !status && !favOnly && !debouncedSeries
            ? 'Sincronizá tu Drive para indexar tus cómics.'
            : 'Probá con otros filtros.'}
        </div>
      ) : (
        <section className="grid">
          {items.map((item) => (
            <ComicCard
              key={item.comicId}
              item={item}
              onFavorite={(id, fav) =>
                setItems((prev) =>
                  prev.map((it) =>
                    it.comicId === id ? { ...it, readingState: { ...it.readingState, isFavorite: fav } } : it,
                  ),
                )
              }
            />
          ))}
        </section>
      )}

      {totalPages > 1 && (
        <footer className="pager">
          <button type="button" className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ←
          </button>
          {pageNumbers.map((n) => (
            <button
              key={n}
              type="button"
              className="btn btn-ghost btn-sm page-num"
              aria-current={n === page ? 'page' : undefined}
              onClick={() => setPage(n)}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            →
          </button>
        </footer>
      )}
    </main>
  );
}
