# 📐 Architect's Ledger: Codebase Map

This file serves as the definitive structural map of the `gcal-simplified` application, optimized for AI agents and human developers alike.

> **Working rules live elsewhere.** This is the *map*; `CLAUDE.md` is the *constitution* (conventions, Definition of Done, performance invariant), and `.claude/` holds the commands, review subagents and skills. `GEMINI.md`, `.agent/` and `.jules/` were removed; if you meet them on an old branch, ignore them.

## 🏢 Core Architecture Principles
* **Feature-Sliced Design:** We prefer grouping by domain/feature (e.g., `src/features/weather/`) rather than strictly by technical type (`src/components/`, `src/hooks/`). This reduces context window usage and co-locates related logic.
* **Single Responsibility:** Files should be small (<300 lines). "God files" should be split into smaller, composable units.
* **Predictability:** File and folder names strictly reflect their domain.

## 🗺️ Domain Boundaries

### `src/features/` (Domain Logic & Co-located Features)
This directory houses isolated, feature-specific modules that bundle their own components, hooks, and utilities.

* **`weather/`**: Handles all weather, marine, and task data display for the dashboard.
  * **`components/`**: Contains small, focused UI components (`WeatherDashboard.tsx`, `WeatherPanel.tsx`, `TasksPanel.tsx`).

### `src/mission-control/` (Command Center)
A strictly isolated application module — the kid-facing reward/mission app.
* **Contract**: Does not import from the parent app's standard `src/components/` or `src/hooks/`. It relies on an injected `MCStoreProvider` — `src/App.tsx` provides it and also mounts the always-running bridges: `MissionSchedulerBridge` (exact-time daily mission triggers via recursive `setTimeout`), `RemoteControlBridge` (remote actions with 2-min-TTL deduplication and a 60s timestamp-validation window), and `MissionOverlay` (fixed-position overlay on top of the calendar view).
* **State**: React Context + `useReducer` — no Zustand, no external state library. Persisted to `localStorage` key `mc-state-v5` with a debounced 500ms sync. `useMCDispatch` is a command interceptor: it injects `timestamp`, derives an activity-log entry, then dispatches the action followed by `ADD_LOG`.
* **`store/`**: `mcReducer.ts` (pure reducer + the `MOOD_TOKENS_PER_DAY` token economy),
  `useMCStore.tsx` (context, persistence, the logging dispatch interceptor),
  `MCStoreProvider.tsx` (mounts the heartbeat, remote sync, audit bridge, suspension expiry and
  the school-calendar sync),
  `routineTasks.ts` (the add-on tasks — Cream, School Bag — and hydration that keeps them across a restart),
  `schoolDays.ts` (school day = Mon–Fri minus calendar no-school dates; `NO_SCHOOL_KEYWORDS`),
  `useSchoolCalendarSync.ts` (reads the family calendar for school days — **MC now invokes
  `auth:check` and `data:events` in its strict mode**, the calendar view's own channels, on launch, mission end,
  `system:resume` and `auth:success`; no timer),
  `activityLog.ts` (action → human-readable log entry, with attribution; the bank and goal
  lines are in `bankLog.ts`),
  shared decisions asked by both the reducer and the log, so a refused action changes nothing and
  writes no line: `adjustedMissionEnd`, `isStaleMissionAction`, `responsibilityPointChange`,
  `responsibilityClaim` (journal: "One decision, asked by the reducer and by the log"),
  `useBehaviorHeartbeat.ts` (60s mood accrual — the ONLY token generator),
  `behaviorSync.ts` (the accrual engine), `moodGauge.ts` (`moveGauge`, the one writer of the gauge),
  `useRemoteSync.ts`, `useAuditTrail.ts` (mirrors log entries to the on-disk trail).
* **`components/activity-log/`**: the parent-facing review surface —
  `logSources.ts` (source metadata + the pure daily roll-up), `LogSummaryStrip.tsx`
  (the five-second glance), `LogItemRow.tsx`, `renderHighlightedMessage.tsx`.
* **`hooks/`**: `useMissionScheduler.ts` (exact-time triggers, late-fire guard, resume re-arm),
  `useRemoteControl.ts` (remote action allowlist), `useMCAutoReturn.ts`.
* **`games/`**: `snake`, `blocks` (Space Rescue), `quiz` (addition + reading), `fruits` (matter.js
  Suika-style). Each follows the game structure pattern in CLAUDE.md → Conventions.
* **`components/quiz-lab/`**: the **dev-only** Quiz Lab at `?lab=1` — plays any question at any
  family/level through the real `QuizOverlay` and shows the distribution of 200 draws. Gated on
  `import.meta.env.DEV` in `src/App.tsx` (see `src/appRoutes.ts`), store-free, mounted outside
  `MCStoreProvider`. Its level table is computed by `games/quizLevelMap.ts` from each game's own
  mapping function (`snakeQuizLevel`, `altitudeLevel`, `deleteTierLevel`).

### `electron/` (Main Process — flat, no subdirectories)
The main process owns Google OAuth2, the Calendar/Tasks API, weather, auto-updates, and remote
control. The renderer is a React app in sandboxed Chromium with `contextIsolation: true`; it
reaches the main process only through the preload bridge.
* `main.ts`: bootstrap — window creation, CSP, IPC registration, auto-updates, resume broadcast.
* `single-instance.ts`: the single-instance lock and the `second-instance` handler. Load-bearing; see CLAUDE.md.
* `preload.ts`: exposes only `window.ipcRenderer.{invoke,on}` behind the two channel whitelists
  (`ALLOWED_INVOKE_CHANNELS`, `ALLOWED_ON_CHANNELS`). A non-whitelisted channel throws.
* `auth.ts` / `api.ts`: Google OAuth2 via local HTTP server redirect flow + Calendar/Tasks.
  `data:events` forgives some failures for the Calendar view (a calendar Google refuses, or the
  holiday feed down, just shrinks the list) but rejects when Google cannot be reached
  (`google-unreachable.ts`; `data:tasks` too): every consumer must catch that and keep what it
  shows. With a plain `{ strict: true }` third argument (the school-bag reader) every failure
  throws.
  Tokens are encrypted with `electron.safeStorage` when available (plaintext fallback) and stored
  in electron-store (`auth-store`), opened on first use by `auth-token-store.ts` (an unparseable
  file is moved aside). `auth-client.ts` is the OAuth client: Google refusing the refresh token
  (`invalid_grant`) signs out and `main.ts` sends `auth:signed-out`, which `src/components/CalendarApp.tsx`
  turns into the login screen. `held-file.ts` reads a token file held by another program again
  before `auth:check` answers; `log-safe.ts` (`errorSummary`) is how an error from Google or the
  token file is logged, never as the object, and `ipcSafe` wraps every `data:`/`auth:` handler.
* `remote-bridge.ts`: Supabase Realtime pairing and action relay. Cryptographic pairing: UUID room
  ID + 15-byte random key; broadcasts on channel `remote-control:{roomId}`; state sync debounced at
  1s; remote actions are dispatched with `isRemote: true`. The companion web app lives in a
  **separate repo**: `C:\Users\brnat\Documents\Projects\mc-remote` (`npm run dev`, usually port 5174).
* `remote-auth.ts`: remote protocol v2, pure. Both events (`action`, `state-update`) travel as
  `{ v: 2, body, sig }` — HMAC-SHA256 of `event + "\n" + body` keyed with the pairing key, which is
  never sent. `remote-bridge.ts` opens every incoming action with it (signature first, then required
  `msgId`/`timestamp`, 60s window, 2-min de-dup) and seals every state-update. The pairing QR URL is
  built by `src/mission-control/utils/pairingUrl.ts`: room, key and `v=2` in the fragment.
* `remote-pairing.ts`: the pairing on disk, owned by the main process, through `store.read()` /
  `store.update()` only. The first v2 start renews an unmarked pairing (`remotePairingVersion`)
  once, in one `store.update` that must land (otherwise the bridge stays offline and retries, never
  on the pairing it was replacing), and `remotePairingRenewedAt` drives the Remote tab's re-scan
  notice (`RemotePairingPanel`, which also draws the QR code from a fresh `settings:get`; that read
  hands out only a v2-marked room and key) and one activity-log line (`store/pairingRenewal.ts`) until the
  phone's first verified message. The bridge keeps the pairing it joined in memory; `settings:save`
  never writes any of it (`PairingField` in `settings-dialog.ts`).
* `audit-log.ts`: append-only NDJSON audit trail (no clear channel by design).
* `power-policy.ts`: night-time screen blanking.
* `store.ts`: `config.json` (calendar selection, settings, remote pairing). `read()` says loaded /
  absent / unreadable; `update()` is the only writer and never writes over a file it cannot read.
* `weather.ts`.

### `src/components/` (Global UI)
Contains global, cross-domain UI components.
* `Dashboard.tsx`: The main application orchestrator and calendar view.
* `MonthlyView.tsx`, `DayColumn.tsx`: Calendar rendering specifics.

### `src/hooks/` (Global State & API Hooks)
Plain hooks, no context providers (`useCalendarData`, `useDashboardLoad`, `useTheme`, `useCurrentDate`).
* `useCalendarData.ts`: the visible month's events, requested and cached per month (`fetchRangeOf`,
  whatever the week start); a new `generation` refetches and drops older answers.
* `useDashboardLoad.ts`: the Dashboard's settings (read first, or the config Save just wrote), tasks
  and weather, the one place an absent week start becomes `'today'`, and the `generation` that
  Save and reconnect bump.

### `src/utils/` (Shared Helpers)
Generic, pure functions used across multiple domains.

---

## 🛠️ Execution Commands
* **Type Check**: `npm run tsc` (the app config, then `tsconfig.test.json`, then `tsconfig.node.json` for the root `*.config.ts` files — bare `npx tsc` skips every test file and every root config)
* **Linting**: `npm run lint`
* **Unit Tests**: `npm run test:unit` (Vitest)
* **E2E Tests**: `npm run test:run` (Playwright — requires built Electron app; runs sequentially because some specs share the real userData)
* **Coverage**: `npx vitest run --coverage` (requires `@vitest/coverage-v8@3.2.4`)
* **Release**: `npm run release` — builds, checks the build for an admin Supabase key (`scripts/package-key-guard.js`), bumps patch, rebuilds, publishes to GitHub Releases (see `/release` workflow, which adds the QA pass)
