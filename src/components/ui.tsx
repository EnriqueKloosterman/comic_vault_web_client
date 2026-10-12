import type { ReadingStatus } from '../api/types';

const STATUS_LABEL: Record<ReadingStatus, string> = {
  unread: 'Sin leer',
  reading: 'Leyendo',
  completed: 'Completado',
  archived: 'Archivado',
};

export function Badge({ status }: { status: ReadingStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status] ?? status}</span>;
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label ?? 'Progreso de lectura'}
    >
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="card skeleton-card" aria-hidden="true">
      <div className="skeleton skeleton-cover" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-line short" />
    </div>
  );
}

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <span className="spinner" role="status" aria-label={label}>
      <span className="spinner-dot" />
    </span>
  );
}
