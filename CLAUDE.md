# CLAUDE.md

## Who are you (AI)
You are the master architect, PM, UX expert, developer and QA of this project!
- You are brutally honest
- Always prefer simplicity (in architecture desitions, code implementation) 
- At the same you are a advocate of "clean architecture" and "clean code" love sharing your knowlage and explaning the reasoning
- Always try to consider different view perpetctive on the same problem, and choose the best out of each approach. 
- Always prefer accuracy over speed
- To avoid noise in your context delegate smaller tasks to sub agents

## Commands

```bash
# Development
npm run dev              # Vite dev server + Electron with HMR
npm run build            # tsc + vite build + electron-builder
npm run tsc              # Type-check only
npm run lint             # ESLint (zero warnings tolerance)

# Testing
npm run test:unit        # Vitest unit tests (jsdom environment)
npm run test:run         # Playwright E2E tests (sequential, Electron)
npm test                 # Full suite: clean + unit + e2e
npx vitest run src/path/to/file.test.ts  # Run a single unit test file

# Release
npm run release          # Version bump + build + GitHub publish
```

## Architecture
**Electron desktop app** (React + Vite + TypeScript) with two main domains:

### Process Model
- **Main process** (`electron/`): Node.js runtime handling Google OAuth2, Calendar/Tasks API, weather, auto-updates, and remote control via Supabase Realtime
- **Renderer process** (`src/`): React app running in sandboxed Chromium with `contextIsolation: true`
- **Preload bridge** (`electron/preload.ts`): Whitelisted IPC channels only — 21 invoke channels, 11 event channels. All other channel access throws

### Two Application Domains

**Calendar App** (`src/components/`, `src/features/`, `src/hooks/`):
- Google Calendar integration with event/task display
- State via React hooks (`useCalendarData`, `useTheme`, `useCurrentDate`)
- Features follow feature-sliced design in `src/features/{name}/`

**Mission Control** (`src/mission-control/`):
- Completely isolated module — **must not import from parent** `src/components/`, `src/hooks/`, etc.
- Own state management: React Context + `useReducer` via `MCStoreProvider`
- Persisted to `localStorage` key `mc-state-v5` with debounced 500ms sync
- `MCStoreProvider` is injected by `App.tsx` (not inside mission-control)
- Contains sub-games in `games/` (snake, blocks, quiz) each following the pattern: `*Overlay.tsx` + `use*Game.ts` hook + `*Canvas.tsx` + `types.ts`

### Key Bridges (always running in App.tsx)
- **MissionSchedulerBridge**: Exact-time daily mission triggers via recursive `setTimeout`
- **RemoteControlBridge**: Supabase Realtime channel for remote actions with deduplication (2-min TTL) and timestamp validation (60s window)
- **MissionOverlay**: Fixed-position overlay that runs on top of calendar view

### Remote Control System (`electron/remote-bridge.ts`)
- Cryptographic pairing: UUID room ID + 15-byte random key
- Broadcasts/receives via Supabase Realtime channel `remote-control:{roomId}`
- State sync debounced at 1s intervals
- Remote actions dispatched with `isRemote: true` flag

### Auth & Token Storage
- Google OAuth2 via local HTTP server redirect flow
- Tokens encrypted with `electron.safeStorage` when available, plaintext fallback
- Stored in electron-store (`auth-store`)

## Conventions

- **File size limit**: Keep files under 300 lines
- **Mission Control isolation**: Never import from `src/components/`, `src/hooks/`, or `src/utils/` inside `src/mission-control/`
- **Game structure pattern**: Each game gets a directory under `src/mission-control/games/` with: `types.ts`, `use[Game]Game.ts` (hook with local state), `[Game]Canvas.tsx`, `[Game]GameOverlay.tsx`, `index.ts`
- **Game state**: Game hooks use local `useState` only. Parent integration via `onClose(score)` callback
- **Styling**: Mix of CSS custom properties (`src/mission-control/styles/mc.css`), inline styles, and Tailwind classes
- **Animation**: Framer Motion for UI transitions; Canvas API for game rendering
- **Reducer purity**: `mcReducer.ts` is a pure reducer — no side effects
- **CSP**: Production build injects strict Content-Security-Policy via Vite HTML transform

## Performance

**Invariant: when the user is idle on the Calendar view, the app must do almost nothing.** The Mission Control store, scheduler, and bridges stay mounted on both views (see `src/App.tsx`), so their background work leaks onto the Calendar unless it is gated. Full detail + the current idle budget: [docs/performance.md](docs/performance.md).

Run this checklist for **any** feature or fix that adds timers, effects, animations, or store writes:

1. **New `setInterval`?** Prefer event-driven or a single `setTimeout` to an exact time. If you must poll: gate it (only run while a mission/game is active or the relevant view is shown), and **register it in `src/__tests__/timer-registry.test.ts`** (the test fails otherwise) with its cadence and whether it runs on an idle Calendar.
2. **Runs on the Calendar view?** If it lives in an always-mounted tree (`MCStoreProvider`, `MissionSchedulerBridge`, `RemoteControlBridge`, `MissionOverlay`, `MoodWindNotification`, `Dashboard`) it runs while the user sits on the Calendar. Make it cheap or gated.
3. **Infinite animation?** No `repeat: Infinity` (Framer) or `... infinite` (CSS) in the always-mounted/Calendar tree. Ensure the element **unmounts** or drops the animation class when inactive — fading to `opacity: 0` does NOT stop a CSS loop. Avoid animating `width`/layout props; use `transform`/`opacity`.
4. **Store write cadence?** Every MC state change → re-render of all `useMCState` consumers + debounced `localStorage` write + remote broadcast. A pure reducer that returns the **same state reference** when nothing changed lets React and the persist effect bail out (see `applyBehaviorSync` / the behavior heartbeat).
5. **`useEffect` cleanup?** Every `setInterval`/`setTimeout`/subscription must be cleared in the effect's cleanup.

Guards that enforce the above (fail `npm run test:unit`): `src/__tests__/timer-registry.test.ts` (no unregistered/uncapped intervals) and `src/mission-control/__tests__/idle-performance.test.tsx` (scheduler gating + heartbeat is churn-free when idle).

## Testing

- **Unit tests** (Vitest + jsdom): `src/**/*.test.ts`, `electron/**/*.test.ts` — setup in `src/test/setup.ts`
- **E2E tests** (Playwright): `e2e/*.spec.ts` — runs sequentially (`workers: 1`) because Electron instances share userData directory
- **Test timeout**: 60s per E2E test
