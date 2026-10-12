import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import type { ReadingState, ReadingStatus } from '../api/types';
import { LoginButton, useAuth } from '../components/Auth';
import { ThemeToggle } from '../components/Theme';
import { Badge, CardSkeleton, ProgressBar, Spinner } from '../components/ui';

function relativeDate(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} mes(es)`;
  return `hace ${Math.floor(months / 12)} año(s)`;
}

const FILTERS: { value: '' | ReadingStatus; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'reading', label: 'Leyendo' },
  { value: 'completed', label: 'Completados' },
  { value: 'archived', label: 'Archivados' },
];

export default function History() {
  const { user, loading } = useAuth();
  const [rows, setRows] = useState<ReadingState[]>([]);
  const [fetching, setFetching] = useState(false);
  const [filter, setFilter] = useState<'' | ReadingStatus>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setFetching(true);
    api
      .history()
      .then(setRows)
      .catch((err: unknown) => {
        if (!(err instanceof ApiError && err.unauthorized)) {
          setError(err instanceof Error ? err.message : 'Error cargando historial');
        }
      })
      .finally(() => setFetching(false));
  }, [user]);

  const visible = useMemo(
    () => (filter === '' ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter],
  );

  if (loading) {
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
          <h1>Historial</h1>
          <p>Iniciá sesión para ver tu progreso de lectura.</p>
          <LoginButton />
        </div>
      </main>
    );
  }

  return (
    <main>
      <header className="topbar">
        <Link to="/" className="brand">
          Comic<span className="brand-accent">Vault</span> <span className="card-meta">/ Historial</span>
        </Link>
        <nav>
          <ThemeToggle />
        </nav>
      </header>

      <section className="filters" aria-label="Filtrar historial">
        <div className="segmented" role="group" aria-label="Estado">
          {FILTERS.map((f) => (
            <button key={f.value} type="button" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
              {f.label}
            </button>
          ))}
        </div>
      </section>

      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      {fetching ? (
        <section className="grid" aria-label="Cargando historial">
          {Array.from({ length: 4 }, (_, i) => (
            <CardSkeleton key={i} />
          ))}
        </section>
      ) : visible.length === 0 ? (
        <div className="empty">
          <strong>Sin registros</strong>
          {rows.length === 0 ? 'Todavía no leíste nada. ¡A la biblioteca!' : 'Nada con este filtro.'}
        </div>
      ) : (
        <ul className="history">
          {visible.map((r) => (
            <li key={r._id}>
              <img
                className="thumb"
                src={api.coverUrl(r.originalComicId)}
                alt=""
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              <div className="grow">
                <Link to={`/read/${r.originalComicId}`}>
                  {r.title} ({r.series} #{r.issueNumber})
                </Link>
                <div>
                  <ProgressBar value={r.progressPercentage} />
                </div>
                <small>
                  pág. {r.currentPage} · {r.progressPercentage}%{r.isFavorite ? ' · ★' : ''}
                  {r.updatedAt ? ` · ${relativeDate(r.updatedAt)}` : ''}
                </small>
              </div>
              <Badge status={r.status} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
