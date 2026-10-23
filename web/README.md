# Trade Capture Terminal (web)

Angular 21 (zoneless, signals, OnPush) trading workspace: live quote board, trade tape, chart,
positions and P&L, a pre-trade-checked note ticket, a command palette and a layout you can
rearrange. Full explanation of every file: `../TRADE-CAPTURE.md`.

## Stack

| Concern | Library |
|---|---|
| Primitives, styling | spartan/ng brain (resizable, command) + Tailwind v4 + class-variance-authority |
| Datagrid | `@tanstack/angular-table` + Angular CDK virtual scroll |
| Server state | `@tanstack/angular-query-experimental` |
| Client state | `@ngrx/signals` (`signalStore`) |
| Charts | `lightweight-charts` v5 behind a `ChartHandle` seam |
| Layout | CDK drag-drop + brain resizable, persisted in `localStorage` |
| Live data | RxJS + WebSocket, pure sequence-gating reducers |

## Run

```bash
npm ci
npm run mock        # mock backend on :4300 (serves dist/ too, live generator off by default)
npm start           # dev server on :4200, proxies /api /ws /actuator to localhost:8080
```

Against the real service: start the Spring app with `CAPTURE_DEMO=true`, then `npm start`.

## Tests

| Layer | Command | Where |
|---|---|---|
| Unit | `npm run test:unit` | `src/app/{core,state,feed,api}/**/*.spec.ts` |
| Integration | `npm run test:integration` | `src/app/app.int.spec.ts` (whole `App`, fake feeds, fake chart, `HttpTestingController`) |
| Everything in the Angular runner | `npm test` | Vitest 4 + jsdom |
| End to end | `CHROMIUM_PATH=/path/to/chrome npm run e2e` | `e2e/terminal.e2e.spec.ts`, real Chromium against `e2e/mock-backend.mjs` |
| Documentation screenshots | `CHROMIUM_PATH=... npm run shots` | `e2e/screens.shots.spec.ts` → `../docs/screenshots` |

## Wire contract v2

`/ws/quotes` and `/ws/trades`: snapshot first, then sequenced deltas, a heartbeat every second;
send `{"type":"resync"}` to get a fresh snapshot. `POST /api/notes` validates the terms
(422 problem with `errors:[{field,message}]`), `GET /api/notes`, `GET /api/notes/{id}/terms`,
`GET /api/system/status`. Every request carries `X-Correlation-Id`.

## Keyboard

`Ctrl/⌘ K` palette · `?` help · `/` filter · `J`/`K` symbol · `Alt T` ticket · `Ctrl ↵` book
(twice on a warning) · `Shift ↑↓` size · `T` theme · `D` density · `M` maximise · `Esc` back.

## Container

`docker build -t trade-capture-terminal .` builds the bundle and serves it from unprivileged
nginx on 8080, proxying `/api` and `/ws` to the service named `capture`. The whole stack:
`DB_PASSWORD=... docker compose -f ../docker/docker-compose.yml up --build`.
