# 📐 Architect's Ledger: Codebase Map

This file serves as the definitive structural map of the `gcal-simplified` application, optimized for AI agents and human developers alike.

## 🏢 Core Architecture Principles
* **Feature-Sliced Design:** We prefer grouping by domain/feature (e.g., `src/features/weather/`) rather than strictly by technical type (`src/components/`, `src/hooks/`). This reduces context window usage and co-locates related logic.
* **Single Responsibility:** Files should be small (<300 lines). "God files" should be split into smaller, composable units.
* **Predictability:** File and folder names strictly reflect their domain.

## 🗺️ Domain Boundaries

### `src/features/` (Domain Logic & Co-located Features)
This directory houses isolated, feature-specific modules that bundle their own components, hooks, and utilities.

* **`weather/`**: Handles all weather, marine, and task data display for the dashboard.
  * **`components/`**: Contains small, focused UI components (`WeatherDashboard.tsx`, `WeatherPanel.tsx`, `TidesPanel.tsx`, `TasksPanel.tsx`).

### `src/mission-control/` (Command Center)
A strictly isolated application module.
* **Contract**: Does not import from the parent app's standard `src/components/` or `src/hooks/`. It relies on an injected `MCStoreProvider`.

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
* **Unit Tests**: `npm run test:unit` (Vitest, 438 tests across 45 files)
* **E2E Tests**: `npm run test:run` (Playwright, 43 tests — requires built Electron app)
* **Coverage**: `npx vitest run --coverage` (requires `@vitest/coverage-v8@3.2.4`)
* **Release**: `npm run release` — bumps patch, builds, publishes to GitHub Releases (see `/release` workflow)
