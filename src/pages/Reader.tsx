import { useVirtualizer } from '@tanstack/react-virtual';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import type { ComicManifest } from '../api/types';
import { ThemeToggle } from '../components/Theme';
import { useToast } from '../components/Toast';
import { Spinner } from '../components/ui';
import { useDebouncedProgress, usePrefetch } from '../components/reader-hooks';

/** Máximo de <img> concurrentes (RNF-04). El virtualizador posiciona; este cap es la garantía dura. */
const MAX_MOUNTED_IMAGES = 5;

/** Zoom del lector: escala sobre fit-width/fit-height. */
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;
const ZOOM_KEY = 'comicvault-zoom';
const MODE_KEY = 'comicvault-read-mode';

type ReadMode = 'gallery' | 'continuous';

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value / ZOOM_STEP) * ZOOM_STEP));
}

function readZoom(): number {
  const raw = Number(localStorage.getItem(ZOOM_KEY));
  return Number.isFinite(raw) && raw > 0 ? clampZoom(raw) : 1;
}

function readMode(): ReadMode {
  return localStorage.getItem(MODE_KEY) === 'continuous' ? 'continuous' : 'gallery';
}

interface ViewHandle {
  goToPage: (index: number) => void;
}

interface FailedState {
  failed: Set<number>;
  markFailed: (index: number) => void;
  retryPage: (index: number) => void;
}

function PageError({ index, onRetry }: { index: number; onRetry: (index: number) => void }) {
  return (
    <div className="page-error">
      <span>Página {index + 1} no disponible</span>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRetry(index)}>
        Reintentar
      </button>
    </div>
  );
}

/* ---------------- Galería: una página encuadrada ---------------- */

const GalleryView = forwardRef<
  ViewHandle,
  {
    comicId: string;
    manifest: ComicManifest;
    page: number;
    onPageChange: (index: number) => void;
    zoom: number;
    onZoomToggle: () => void;
    failed: FailedState;
  }
>(function GalleryView({ comicId, manifest, page, onPageChange, zoom, onZoomToggle, failed }, ref) {
  const stageRef = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);
  const idleTimer = useRef<number | undefined>(undefined);
  const [navActive, setNavActive] = useState(true);
  const finePointer = useMemo(
    () => window.matchMedia('(pointer: fine)').matches,
    [],
  );
  const pageCount = manifest.pageCount;
  const clamped = Math.max(0, Math.min(page, pageCount - 1));

  useImperativeHandle(ref, () => ({
    goToPage: (index: number) => onPageChange(Math.max(0, Math.min(index, pageCount - 1))),
  }));

  useEffect(() => () => window.clearTimeout(idleTimer.current), []);

  const pokeNav = () => {
    if (!finePointer) return;
    setNavActive(true);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setNavActive(false), 2500);
  };

  const zoomed = zoom > 1;
  // Las flechas responden solo al puntero (idle): no dependen de la barra,
  // para que mover el mouse siempre las revele aunque se esté scrolleando.
  const navVisible = navActive;
  const navClass = (side: string) => `gallery-nav ${side}${navVisible ? '' : ' nav-hidden'}`;

  return (
    <div
      ref={stageRef}
      className={zoomed ? 'gallery-stage zoomed' : 'gallery-stage'}
      data-testid="gallery-stage"
      onMouseMove={pokeNav}
      onTouchStart={(e) => {
        touchX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (dx <= -50) onPageChange(Math.min(clamped + 1, pageCount - 1));
        else if (dx >= 50) onPageChange(Math.max(clamped - 1, 0));
      }}
    >
      <button
        type="button"
        className={navClass('gallery-prev')}
        disabled={clamped <= 0}
        onClick={() => onPageChange(clamped - 1)}
        aria-label="Página anterior"
        tabIndex={navVisible ? 0 : -1}
      >
        ‹
      </button>
      <div
        className={zoomed ? 'gallery-viewport zoomed' : 'gallery-viewport'}
        style={zoomed ? { width: `${zoom * 100}%`, marginLeft: `${-50 * (zoom - 1)}%` } : undefined}
      >
        {failed.failed.has(clamped) ? (
          <PageError index={clamped} onRetry={failed.retryPage} />
        ) : (
          <img
            key={`${comicId}-${clamped}`}
            src={api.pageUrl(comicId, clamped)}
            alt={`Página ${clamped + 1}`}
            draggable={false}
            className={zoomed ? 'gallery-img-zoomed' : 'gallery-img'}
            onError={() => failed.markFailed(clamped)}
            onDoubleClick={onZoomToggle}
          />
        )}
      </div>
      <button
        type="button"
        className={navClass('gallery-next')}
        disabled={clamped >= pageCount - 1}
        onClick={() => onPageChange(clamped + 1)}
        aria-label="Página siguiente"
        tabIndex={navVisible ? 0 : -1}
      >
        ›
      </button>
    </div>
  );
});

/* ---------------- Continuo: scroll virtualizado ---------------- */

const ContinuousView = forwardRef<
  ViewHandle,
  {
    comicId: string;
    manifest: ComicManifest;
    initialPage: number;
    onVisible: (index: number) => void;
    onScrollY: (y: number) => void;
    zoom: number;
    onZoomToggle: () => void;
    failed: FailedState;
  }
>(function ContinuousView({ comicId, manifest, initialPage, onVisible, onScrollY, zoom, onZoomToggle, failed }, ref) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageCount = manifest.pageCount;

  const virtualizer = useVirtualizer({
    count: pageCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => window.innerHeight * zoom,
    overscan: 1,
  });

  useImperativeHandle(ref, () => ({
    goToPage: (index: number) =>
      virtualizer.scrollToIndex(Math.max(0, Math.min(index, pageCount - 1)), { align: 'start' }),
  }));

  // Resume al montar (también al volver de galería con otra página).
  // Intencionalmente solo-montaje: re-ejecutar en cada render rompería el scroll del usuario.
  useEffect(() => {
    if (initialPage > 0) virtualizer.scrollToIndex(initialPage, { align: 'start' });
    virtualizer.measure();
  }, []);

  // Re-medir cuando cambia el zoom.
  useEffect(() => {
    virtualizer.measure();
  }, [zoom, virtualizer]);

  const items = virtualizer.getVirtualItems();
  const firstVisible = items[0]?.index ?? initialPage;

  useEffect(() => {
    onVisible(firstVisible);
  }, [firstVisible, onVisible]);

  const visible = useMemo(() => items.slice(0, MAX_MOUNTED_IMAGES), [items]);

  return (
    <div
      ref={scrollRef}
      className="reader-scroll"
      data-testid="reader-scroll"
      onScroll={(e) => onScrollY(e.currentTarget.scrollTop)}
    >
      <div style={{ height: virtualizer.getTotalSize(), width: `${zoom * 100}%`, position: 'relative' }}>
        {visible.map((row) => (
          <div
            key={row.key}
            data-index={row.index}
            ref={virtualizer.measureElement}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${row.start}px)` }}
          >
            {failed.failed.has(row.index) ? (
              <PageError index={row.index} onRetry={failed.retryPage} />
            ) : (
              <img
                src={api.pageUrl(comicId, row.index)}
                alt={`Página ${row.index + 1}`}
                draggable={false}
                onError={() => failed.markFailed(row.index)}
                onDoubleClick={onZoomToggle}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
});

/* ---------------- Contenedor ---------------- */

export default function Reader() {
  const { id } = useParams();
  const comicId = id as string;
  const toast = useToast();
  const galleryRef = useRef<ViewHandle>(null);
  const continuousRef = useRef<ViewHandle>(null);
  const [manifest, setManifest] = useState<ComicManifest | null>(null);
  const [page, setPage] = useState(0);
  const [ready, setReady] = useState(false);
  const [failedSet, setFailedSet] = useState<Set<number>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(readZoom);
  const [mode, setMode] = useState<ReadMode>(readMode);
  const [chromeHidden, setChromeHidden] = useState(false);
  const lastScrollY = useRef(0);

  // Chrome auto-hide: se esconde scrolleando hacia abajo, vuelve hacia arriba,
  // cerca del inicio o con hover en la franja superior.
  const updateChrome = useCallback(
    (y: number) => {
      const last = lastScrollY.current;
      lastScrollY.current = y;
      if (y < 60) setChromeHidden(false);
      else if (y > last + 6) setChromeHidden(true);
      else if (y < last - 6) setChromeHidden(false);
    },
    [],
  );

  useEffect(() => {
    const onWinScroll = () => updateChrome(window.scrollY);
    window.addEventListener('scroll', onWinScroll, { passive: true });
    return () => window.removeEventListener('scroll', onWinScroll);
  }, [updateChrome]);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setFailedSet(new Set());
    Promise.all([api.manifest(comicId), api.history()])
      .then(([m, history]) => {
        if (cancelled) return;
        setManifest(m);
        const state = history.find((h) => h.originalComicId === m.comicId);
        setPage(Math.min(state?.currentPage ?? 0, Math.max(m.pageCount - 1, 0)));
        setReady(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.unauthorized) {
          window.location.href = api.loginUrl();
          return;
        }
        setLoadError(err instanceof Error ? err.message : 'No se pudo abrir el cómic');
      });
    return () => {
      cancelled = true;
    };
  }, [comicId]);

  useEffect(() => {
    localStorage.setItem(ZOOM_KEY, String(zoom));
  }, [zoom]);

  useEffect(() => {
    localStorage.setItem(MODE_KEY, mode);
  }, [mode]);

  const pageCount = manifest?.pageCount ?? 0;
  const activeRef = mode === 'gallery' ? galleryRef : continuousRef;

  useDebouncedProgress(ready ? comicId : undefined, page);
  usePrefetch(ready ? comicId : undefined, page, pageCount);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        activeRef.current?.goToPage(Math.min(page + 1, pageCount - 1));
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        activeRef.current?.goToPage(Math.max(page - 1, 0));
      } else if (e.key === '+' || e.key === '=') {
        setZoom((z) => clampZoom(z + ZOOM_STEP));
      } else if (e.key === '-') {
        setZoom((z) => clampZoom(z - ZOOM_STEP));
      } else if (e.key === '0') {
        setZoom(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const failed: FailedState = useMemo(
    () => ({
      failed: failedSet,
      markFailed: (index: number) => setFailedSet((prev) => new Set(prev).add(index)),
      retryPage: (index: number) =>
        setFailedSet((prev) => {
          const next = new Set(prev);
          next.delete(index);
          return next;
        }),
    }),
    [failedSet],
  );

  const goToPage = (index: number) => activeRef.current?.goToPage(index);

  const restart = async () => {
    goToPage(0);
    setPage(0);
    try {
      await api.patchProgress(comicId, 0, true);
      toast.push('info', 'Lectura reiniciada en la página 1');
    } catch (err) {
      toast.push('error', err instanceof Error ? err.message : 'No se pudo reiniciar');
    }
  };

  const toggleZoom = () => setZoom((z) => (z > 1 ? 1 : 2));

  if (loadError) {
    return (
      <main>
        <p className="alert" role="alert">
          {loadError}
        </p>
        <Link to="/">Volver a la biblioteca</Link>
      </main>
    );
  }
  if (!ready || !manifest) {
    return (
      <main>
        <Spinner label="Cargando cómic…" /> Cargando cómic…
      </main>
    );
  }

  const zoomLabel = `${Math.round(zoom * 100)}%`;

  return (
    <main className="reader">
      <div
        className="chrome-hover-zone"
        aria-hidden="true"
        onMouseEnter={() => setChromeHidden(false)}
      />
      <header className={chromeHidden ? 'reader-bar chrome-hidden' : 'reader-bar'}>
        <Link to="/">← Biblioteca</Link>
        <span className="reader-title" title={manifest.title}>
          {manifest.title}
        </span>
        <div className="segmented" role="group" aria-label="Modo de lectura">
          <button
            type="button"
            aria-pressed={mode === 'gallery'}
            onClick={() => setMode('gallery')}
            title="Una página por vez"
          >
            Galería
          </button>
          <button
            type="button"
            aria-pressed={mode === 'continuous'}
            onClick={() => setMode('continuous')}
            title="Scroll continuo"
          >
            Continuo
          </button>
        </div>
        <input
          type="range"
          className="reader-slider"
          min={0}
          max={Math.max(pageCount - 1, 0)}
          value={page}
          onChange={(e) => goToPage(Number(e.target.value))}
          aria-label="Ir a la página"
        />
        <span className="reader-count">
          {page + 1} / {pageCount}
        </span>
        <div className="zoom-controls" role="group" aria-label="Zoom">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
            disabled={zoom <= MIN_ZOOM}
            aria-label="Reducir zoom"
          >
            −
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm zoom-label"
            onClick={() => setZoom(1)}
            aria-label="Restablecer zoom al 100%"
            title="Restablecer zoom (tecla 0)"
          >
            {zoomLabel}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
            disabled={zoom >= MAX_ZOOM}
            aria-label="Aumentar zoom"
          >
            +
          </button>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={restart} title="Volver a la página 1">
          Reiniciar
        </button>
        <ThemeToggle />
      </header>

      {mode === 'gallery' ? (
        <GalleryView
          ref={galleryRef}
          comicId={comicId}
          manifest={manifest}
          page={page}
          onPageChange={setPage}
          zoom={zoom}
          onZoomToggle={toggleZoom}
          failed={failed}
        />
      ) : (
        <ContinuousView
          ref={continuousRef}
          comicId={comicId}
          manifest={manifest}
          initialPage={page}
          onVisible={setPage}
          onScrollY={updateChrome}
          zoom={zoom}
          onZoomToggle={toggleZoom}
          failed={failed}
        />
      )}
    </main>
  );
}
