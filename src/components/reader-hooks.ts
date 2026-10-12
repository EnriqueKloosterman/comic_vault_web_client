import { useEffect, useRef } from 'react';
import { api } from '../api/client';

/**
 * Sincroniza progreso con debounce 1500ms (optimistic UI).
 * Hace flush pendiente en unmount para no perder la última página.
 */
export function useDebouncedProgress(comicId: string | undefined, currentPage: number) {
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<number | null>(null);
  const lastSent = useRef<number>(-1);

  useEffect(() => {
    if (comicId === undefined || currentPage === lastSent.current) return;
    pending.current = currentPage;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const page = pending.current;
      pending.current = null;
      if (page === null || page === lastSent.current) return;
      lastSent.current = page;
      api.patchProgress(comicId, page).catch((err: unknown) => {
        console.error('progress sync failed', err);
        lastSent.current = -1; // reintenta en el próximo cambio
      });
    }, 1500);
  }, [comicId, currentPage]);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (pending.current !== null && comicId !== undefined && pending.current !== lastSent.current) {
        const page = pending.current;
        // keepalive: sobrevive a la navegación/cierre de pestaña.
        void fetch(`/api/comics/${comicId}/progress`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPage: page }),
          keepalive: true,
        }).catch(() => undefined);
      }
    },
    [comicId],
  );
}

/** Precarga N+1 y N+2 en caché del navegador (las respuestas son immutable). */
export function usePrefetch(comicId: string | undefined, currentPage: number, pageCount: number) {
  useEffect(() => {
    if (comicId === undefined) return;
    for (const next of [currentPage + 1, currentPage + 2]) {
      if (next < pageCount) {
        const img = new Image();
        img.src = api.pageUrl(comicId, next);
      }
    }
  }, [comicId, currentPage, pageCount]);
}
