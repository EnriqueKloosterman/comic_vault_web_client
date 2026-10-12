import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { CatalogItem } from '../api/types';
import { Badge, ProgressBar } from './ui';

function overlayLabel(item: CatalogItem): string {
  const { status, currentPage } = item.readingState;
  if (status === 'completed') return 'Leer de nuevo';
  if (currentPage > 0) return `Continuar pág. ${currentPage + 1}`;
  return 'Leer';
}

export function ComicCard({ item, onFavorite }: { item: CatalogItem; onFavorite: (id: string, fav: boolean) => void }) {
  const [fav, setFav] = useState(item.readingState.isFavorite);
  const toggle = async () => {
    const next = !fav;
    setFav(next); // optimistic
    try {
      await api.patchFavorite(item.comicId, next);
      onFavorite(item.comicId, next);
    } catch (err) {
      console.error(err);
      setFav(!next);
    }
  };
  return (
    <article className="card">
      <Link to={`/read/${item.comicId}`} className="card-cover" aria-label={`Leer ${item.title}`}>
        <img src={api.coverUrl(item.comicId)} alt={`Portada de ${item.title}`} loading="lazy" />
        <span className="card-overlay">{overlayLabel(item)}</span>
      </Link>
      <div className="card-body">
        <Link to={`/read/${item.comicId}`} className="card-title">
          {item.title}
        </Link>
        <span className="card-meta">
          {item.series} #{item.issueNumber}
        </span>
        <ProgressBar value={item.readingState.progressPercentage} />
        <div className="card-foot">
          <Badge status={item.readingState.status} />
          <button
            type="button"
            className="fav-btn"
            onClick={toggle}
            aria-pressed={fav}
            aria-label={fav ? 'Quitar de favoritos' : 'Marcar como favorito'}
            title="Favorito"
          >
            {fav ? '★' : '☆'}
          </button>
        </div>
      </div>
    </article>
  );
}
