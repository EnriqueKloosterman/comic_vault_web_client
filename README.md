# ComicVault — Web Client

Cliente web (SPA) de **ComicVault**: biblioteca personal de cómics indexados desde Google Drive, con lector optimizado, progreso sincronizado y sesión vía cookie HttpOnly.

> Backend esperado: API REST en `http://localhost:3000` en desarrollo (o `http://backend:3000` en Docker), servida bajo el mismo origen en `/api` (sin CORS).

---

## 1. Stack técnico

| Capa | Tecnología | Versión |
|---|---|---|
| UI | React + React DOM | 19.x |
| Router | react-router-dom | 7.x |
| Build / Dev server | Vite | 6.x |
| Lenguaje | TypeScript (estricto) | 5.6 |
| Virtualización | @tanstack/react-virtual | 3.11 |
| E2E | Playwright | 1.49 |
| Lint | ESLint 9 (flat config) + @typescript-eslint | 9 / 8 |
| Formato | Prettier | 3.x |
| Package manager | pnpm | 10.32.1 |
| Runtime prod | nginx:1.27-alpine (estático + proxy `/api`) | — |
| Node (build/dev) | Node.js | 22 (verificado `v22.16.0`) |

Sin librerías de estado global, sin CSS-in-JS, sin UI kit: estilos propios en `src/styles.css` + `src/theme.css` (tema claro/oscuro con `ThemeProvider`).

## 2. Requisitos previos

- Node.js ≥ 22
- pnpm ≥ 10 (`corepack enable` lo provee)
- Backend ComicVault corriendo (puerto 3000) con endpoints `/api/*`
- (Opcional) Docker para despliegue productivo

## 3. Estructura del proyecto

```
web/
├── index.html              # Entry HTML, <div id="root">
├── vite.config.ts          # Dev server :5173 + proxy /api → :3000
├── tsconfig.json           # TS estricto, jsx react-jsx, noEmit
├── eslint.config.js        # Flat config ESLint 9
├── playwright.config.ts    # E2E contra http://localhost:5173
├── nginx.conf              # Prod: SPA fallback + proxy /api/ → backend:3000
├── Dockerfile              # Multi-stage: node build → nginx serve
├── .env.example            # Plantilla de variables (VITE_API_URL)
├── src/
│   ├── main.tsx            # Bootstrap React StrictMode
│   ├── App.tsx             # Providers + rutas
│   ├── api/
│   │   ├── client.ts       # Wrapper fetch + endpoints (credentials:include)
│   │   └── types.ts        # CatalogItem, Manifest, ReadingState, RFC7807, …
│   ├── components/
│   │   ├── Auth.tsx        # AuthProvider, useAuth, LoginButton
│   │   ├── Theme.tsx       # ThemeProvider, ThemeToggle (localStorage)
│   │   ├── Toast.tsx       # ToastProvider, useToast
│   │   ├── ComicCard.tsx   # Tarjeta de catálogo (optimistic favorite)
│   │   ├── ui.tsx          # Badge, ProgressBar, CardSkeleton, Spinner
│   │   └── reader-hooks.ts # useDebouncedProgress, usePrefetch
│   ├── pages/
│   │   ├── Library.tsx     # Catálogo + filtros + paginación + Sync Drive
│   │   ├── Series.tsx      # Wrapper de Library con filtro de serie fijo
│   │   ├── Reader.tsx      # Lector (galería / continuo virtualizado)
│   │   └── History.tsx     # Historial de lectura con filtros
│   ├── styles.css / theme.css
└── tests/
    └── reader.spec.ts      # E2E Playwright del lector
```

## 4. Arquitectura y decisiones

### 4.1 Mismo origen, sin CORS
Tanto en dev (proxy Vite) como en prod (proxy nginx) el frontend habla con el backend por ruta relativa `/api`. La cookie HttpOnly de sesión viaja automáticamente (`credentials: 'include'`). No hay tokens en `localStorage`.

- Dev: `vite.config.ts` → `'/api': { target: 'http://localhost:3000' }`
- Prod: `nginx.conf` → `location /api/ { proxy_pass http://backend:3000; … }`

### 4.2 Autenticación
- `AuthProvider` llama a `GET /api/auth/me` al montar. `401` → estado no logueado (sin ruido en consola); otro error → `console.error`.
- Login = redirect a `GET /api/auth/google` (`api.loginUrl()`).
- Logout = `POST /api/auth/logout` (se ignora error, se limpia estado local).
- `Reader` redirige a login (`window.location.href`) si el manifest devuelve `401`.

### 4.3 Rutas (react-router-dom)

| Ruta | Componente | Descripción |
|---|---|---|
| `/` | `Library` | Catálogo paginado, filtros, Sync Drive |
| `/series/:s` | `Series` → `Library` | Misma biblioteca con `initialSeries` prefijado |
| `/read/:id` | `Reader` | Lector del cómic `:id` |
| `/history` | `History` | Historial global (`GET /api/reading-history`) |

Orden de providers en `App.tsx`: `ThemeProvider → ToastProvider → AuthProvider → BrowserRouter`.

### 4.4 Biblioteca (`Library.tsx`)
- Filtros: `status` (todos/unread/reading/completed/archived), `favorite` (checkbox), `series` (búsqueda con **debounce 400 ms**).
- Paginación servidor: `page` / `limit=24`, ventana de hasta 7 números.
- `Sync Drive` → `POST /api/sync/drive` → toast `added/kept/archived` → recarga catálogo.
- Estados: skeleton (8 `CardSkeleton`) cargando, vacío (`Biblioteca vacía` vs `Sin resultados`), alerta de error. `401` silencioso (muestra hero de login).
- Favorito optimista en `ComicCard`: actualiza UI, revierte si falla el `PATCH`.

### 4.5 Lector (`Reader.tsx`) — pieza crítica de rendimiento
Dos modos conmutables (persistidos en `localStorage: comicvault-read-mode`):

1. **Galería** (`GalleryView`): una sola `<img>` en DOM. Flechas ‹ › con auto-hide (2500 ms idle, solo puntero fino), swipe táctil (±50 px), doble-click alterna zoom 1x/2x.
2. **Continuo** (`ContinuousView`): scroll virtualizado con `@tanstack/react-virtual` (`overscan: 1`), **cap duro `MAX_MOUNTED_IMAGES = 5`** (RNF-04): aunque el virtualizador entregue más filas, solo se montan 5 `<img>` (`items.slice(0, 5)`).

Comportamiento común:
- Carga: `GET manifest + GET history` en paralelo; resume en `currentPage` del historial (clampeado a `pageCount - 1`).
- Zoom 1x–3x paso 0.25 (`localStorage: comicvault-zoom`), controles `− / % / +`, teclas `+ - 0`, flechas `← → ↑ ↓` navegan.
- Slider `range` + contador `N / total`.
- Chrome auto-hide en scroll (se oculta bajando, reaparece subiendo / cerca del top / hover en franja superior).
- `Reiniciar` → `PATCH progress { currentPage: 0, isRewind: true }` + toast.
- Fallo de imagen → bloque `PageError` con `Reintentar` (set de fallidas por índice).

### 4.6 Sincronización de progreso (`reader-hooks.ts`)
- `useDebouncedProgress(comicId, page)`: debounce **1500 ms**, evita reenvíos (`lastSent`), y hace **flush con `keepalive: true`** en unmount para no perder la última página al navegar/cerrar.
- `usePrefetch(comicId, page, pageCount)`: precarga `N+1` y `N+2` con `new Image()` (las respuestas del backend son inmutables → caché del navegador).

### 4.7 Manejo de errores API
`ApiError` envuelve errores **RFC7807** del backend (`{ statusCode, code, message, path, … }`). `request<T>()`:
- `credentials: 'include'` siempre.
- `204` → `undefined`.
- No-OK con JSON → lanza `ApiError`; sin JSON → `Error('HTTP <status> en <path>')`.
- Flag `unauthorized` (`status === 401`) para ramificar UI de login.

## 5. Contrato API consumido

Base: `VITE_API_URL` (vacío = mismo origen). Todos los paths abajo son relativos.

| Método | Path | Uso |
|---|---|---|
| `GET` | `/api/auth/me` | Sesión actual → `{ userId, email }` |
| `POST` | `/api/auth/logout` | Cierre de sesión |
| `GET` | `/api/auth/google` | Inicio OAuth (navegación, no fetch) |
| `GET` | `/api/comics?page&limit&status&favorite&series` | Catálogo → `CatalogPage { data, total, page, limit, totalPages }` |
| `GET` | `/api/comics/:id/manifest` | Manifiesto → `{ comicId, title, series, issueNumber, pageCount, pages }` |
| `GET` | `/api/comics/:id/pages/:index` | Imagen de página (`<img src>`, precarga) |
| `GET` | `/api/comics/:id/cover` | Portada (`<img src>`, `lazy`) |
| `PATCH` | `/api/comics/:id/progress { currentPage, isRewind? }` | Guarda progreso → `ReadingState` |
| `PATCH` | `/api/comics/:id/favorite { isFavorite }` | Toggle favorito → `ReadingState` |
| `GET` | `/api/reading-history` | Historial → `ReadingState[]` |
| `POST` | `/api/sync/drive` | Reindexa Drive → `{ added, kept, archived }` |

Tipos centrales (`src/api/types.ts`): `ReadingStatus = 'unread' | 'reading' | 'completed' | 'archived'`, `CatalogItem`, `CatalogPage`, `ComicManifest`, `ReadingState`, `SessionUser`, `Rfc7807Error`.

## 6. Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `VITE_API_URL` | `''` (mismo origen) | Prefijo del backend. En dev con proxy y en prod tras nginx se deja **vacío**. Solo se define si el frontend debe apuntar a un host distinto. |

```bash
cp .env.example .env
# .env queda ignorado por git (.gitignore)
```

## 7. Desarrollo local

```bash
# Instalar (pnpm 10.32.1, Node 22)
corepack enable
pnpm install

# Dev (http://localhost:5173, requiere backend en :3000)
pnpm dev

# Chequeos
pnpm lint        # eslint "src/**/*.{ts,tsx}"
pnpm format      # prettier --write
pnpm build       # tsc -b && vite build  → dist/
pnpm preview     # sirve dist/ en :5173
```

## 8. Tests E2E (Playwright)

Requieren **backend arriba con sesión válida (cookie)** y al menos un cómic indexado.

```bash
pnpm dev            # terminal 1 (frontend :5173)
# backend en :3000  # terminal 2
pnpm test:e2e       # terminal 3
# Con cómic fijo:
E2E_COMIC_ID=<id> pnpm test:e2e
```

Cobertura (`tests/reader.spec.ts`):
1. **Galería**: exactamente 1 `<img>` en el stage y la navegación cambia el contador.
2. **Continuo**: nunca más de 5 `<img>` en DOM tras 6 saltos de scroll (RNF-04).
3. **Persistencia**: avanzar 3 páginas + esperar debounce 1500 ms → reload mantiene la página.

Config: `playwright.config.ts` (`baseURL: http://localhost:5173`, solo Chromium, `trace: retain-on-failure`).

## 9. Producción (Docker + nginx)

```bash
docker build -t comicvault-web .
docker run -p 8080:80 comicvault-web
# En compose: el servicio web debe resolver `backend:3000` (ver nginx.conf)
```

- Stage 1 (`builder`, `node:22-alpine`): `pnpm install --frozen-lockfile` + `pnpm run build`.
- Stage 2 (`runner`, `nginx:1.27-alpine`): sirve `dist/` + `nginx.conf`:
  - `location /` → `try_files … /index.html` (fallback SPA).
  - `location /api/` → `proxy_pass http://backend:3000` preservando `Cookie` y `Set-Cookie`.

## 10. Calidad y convenciones

- TypeScript `strict` + `noUnusedLocals` + `noUnusedParameters`; `tsc -b` corre antes de cada build.
- ESLint flat config (`eslint.config.js`), ignora `dist/`, `node_modules/`, reportes Playwright.
- Accesibilidad: `aria-pressed` en segmentados, `role="progressbar"`, `role="alert"`, `aria-label` en slider/botones, `aria-current="page"` en paginador, skeletons con `aria-hidden`.
- Convención de commits sugerida: `feat:`, `fix:`, `docs:`, `test:`, `chore:`.

## 11. Troubleshooting

| Síntoma | Causa probable | Acción |
|---|---|---|
| Hero de login en bucle | Backend sin sesión / cookie bloqueada | Verificar `POST /api/auth/google`, cookie `HttpOnly; SameSite=Lax`, mismo origen |
| `Sync fallido` | Backend/Drive caído | Revisar `POST /api/sync/drive` y credenciales de Drive en backend |
| Páginas en blanco con `Reintentar` | CBZ corrupto o índice fuera de rango | Revisar `manifest.pageCount` vs archivos; re-sincronizar |
| E2E `Timeout 15000ms` en `.card a` | Sin cómics indexados o sin sesión | Indexar (`Sync Drive`) e iniciar sesión manual antes del run |
| `HTTP 404 en /api/...` en prod | Servicio `backend` no resoluble | Revisar compose network / `proxy_pass` en `nginx.conf` |
