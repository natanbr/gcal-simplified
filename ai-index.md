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
A strictly isolated application module.
* **Contract**: Does not import from the parent app's standard `src/components/` or `src/hooks/`. It relies on an injected `MCStoreProvider`.
* **`store/`**: `mcReducer.ts` (pure reducer + the `MOOD_TOKENS_PER_DAY` token economy),
  `useMCStore.tsx` (context, persistence, the logging dispatch interceptor),
  `MCStoreProvider.tsx` (mounts the heartbeat, remote sync and audit bridge),
  `activityLog.ts` (action → human-readable log entry, with attribution),
  `useBehaviorHeartbeat.ts` (60s mood accrual — the ONLY token generator),
  `useRemoteSync.ts`, `useAuditTrail.ts` (mirrors log entries to the on-disk trail).
* **`components/activity-log/`**: the parent-facing review surface —
  `logSources.ts` (source metadata + the pure daily roll-up), `LogSummaryStrip.tsx`
  (the five-second glance), `LogItemRow.tsx`, `renderHighlightedMessage.tsx`.
* **`hooks/`**: `useMissionScheduler.ts` (exact-time triggers, late-fire guard, resume re-arm),
  `useRemoteControl.ts` (remote action allowlist), `useMCAutoReturn.ts`.
* **`components/quiz-lab/`**: the **dev-only** Quiz Lab at `?lab=1` — plays any question at any
  family/level through the real `QuizOverlay` and shows the distribution of 200 draws. Gated on
  `import.meta.env.DEV` in `src/App.tsx` (see `src/appRoutes.ts`), store-free, mounted outside
  `MCStoreProvider`. Its level table is computed by `games/quizLevelMap.ts` from each game's own
  mapping function (`snakeQuizLevel`, `altitudeLevel`, `deleteTierLevel`).

### `electron/` (Main Process — flat, no subdirectories)
* `main.ts`: single-instance lock, window creation, CSP, IPC registration, resume broadcast.
* `preload.ts`: the two channel whitelists. A non-whitelisted channel throws.
* `auth.ts` / `api.ts`: Google OAuth2 + Calendar/Tasks.
* `remote-bridge.ts`: Supabase Realtime pairing and action relay.
* `audit-log.ts`: append-only NDJSON audit trail (no clear channel by design).
* `power-policy.ts`: night-time screen blanking.
* `store.ts`, `weather.ts`.

### `src/components/` (Global UI)
Contains global, cross-domain UI components.
* `Dashboard.tsx`: The main application orchestrator and calendar view.
* `MonthlyView.tsx`, `DayColumn.tsx`: Calendar rendering specifics.

### `src/hooks/` (Global State & API Hooks)
* `useCalendarData.ts`: Central hook for syncing with external calendar APIs.

### `src/utils/` (Shared Helpers)
Generic, pure functions used across multiple domains.

---

## 🛠️ Execution Commands
* **Type Check**: `npx tsc --noEmit`
* **Linting**: `npm run lint`
* **Unit Tests**: `npm run test:unit` (Vitest, 639 tests across 61 files)
* **E2E Tests**: `npm run test:run` (Playwright, 44 tests — requires built Electron app; runs sequentially because instances share userData)
* **Coverage**: `npx vitest run --coverage` (requires `@vitest/coverage-v8@3.2.4`)
* **Release**: `npm run release` — bumps patch, builds, publishes to GitHub Releases (see `/release` workflow)
