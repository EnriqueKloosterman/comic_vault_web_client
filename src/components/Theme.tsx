import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'comicvault-theme';

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function readStored(): Theme | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === 'light' || raw === 'dark' ? raw : null;
}

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'dark', toggle: () => undefined });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => readStored() ?? systemTheme());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function ThemeToggle() {
  const { theme, toggle } = useContext(ThemeContext);
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={toggle}
      aria-label={dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      title={dark ? 'Tema claro' : 'Tema oscuro'}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        {dark ? (
          <>
            <circle cx="8" cy="8" r="3.2" />
            <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1" />
          </>
        ) : (
          <path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z" />
        )}
      </svg>
    </button>
  );
}
