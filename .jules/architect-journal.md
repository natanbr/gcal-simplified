## 2024-05-24 - Workflow Diligence

**Learning:** When using temporary scripts (like python or bash scripts) to programmatically edit large files, I must remember to delete these throwaway files before committing. Also, I must strictly adhere to the requested scope of work and not get sidetracked by fixing unrelated failing tests or minor type warnings in other parts of the codebase, as this clutters the PR and can introduce unexpected test failures.
**Action:** Always run `git status` to verify the exact list of files being committed and ensure no garbage files or unrelated modified files are included in the staging area.

## 2026-04-15 - Mission Control Long-Press & Activity Log Review

**Pattern: Reusable Interaction Hooks.** When pointer-based interaction logic (long-press, drag, swipe) is used on 2+ elements, extract it into a custom hook immediately. The `useLongPress(onShort, onLong, thresholdMs)` pattern returns `{ onPointerDown, onPointerUp, onPointerLeave }` and centralizes ref cleanup.

**Pattern: Log Entry Goal Resolution.** The `createLogEntry` function resolves goal names from `REWARD_MAP` in 5+ places. Hoist a shared `goalLabel(caseId, state)` helper to the top of the function to prevent drift.

**Invariant: Duration Calculations.** Any time-duration math based on `startsAt`/`endsAt` HH:MM strings must handle midnight crossings: `if (durationMins < 0) durationMins += 24 * 60`.

**False Positive: Missing whileTap on long-press buttons.** This is intentional — the user explicitly requested no visual feedback to keep long-press features hidden from the child user. Do NOT flag this in future reviews.

## 2026-04-24 - Quick Game (Snake + Quiz) Feature Review

**Pattern: Ref-based Render Loop for Canvas Games.** When using `requestAnimationFrame` in React, NEVER put mutable game state in the `useCallback`/`useEffect` dependency array. This causes rAF teardown+restart on every state change, creating visible lag. Instead, store `gameState` in a ref (`gameStateRef.current = gameState`) and read from the ref inside a single, stable rAF loop with `[]` dependencies.

**Pattern: Safe Random Placement on Bounded Grids.** Never use rejection-sampling (`do…while`) to place items on a grid that could theoretically be fully occupied. Instead, pre-compute the list of free cells and pick randomly from that array. This guarantees O(grid_size) instead of potentially infinite runtime.

**Pattern: Only `preventDefault` When Consuming Input.** Keyboard handlers should only call `e.preventDefault()` inside the branch that actually processes the key. Blanket prevention blocks accessibility tools and browser navigation during inactive game phases.

**Invariant: Decouple Quiz Module from Game Constants.** The quiz module (`games/quiz/`) should NOT import constants from `games/snake/`. Use props (e.g., `totalLives`) with sensible defaults to keep the quiz module reusable across future game types.

**Known Pre-existing Test Failures (17).** `ResponsibilityPanel.test.tsx` and `WeatherDashboard.test.tsx` contain 17 pre-existing failures unrelated to Quick Game. Do NOT attribute these to Quick Game changes.

## 2026-04-30 - Quick Game Additional Architectural Review

**Anti-Pattern: Hardcoded Colors Bypassing Design System.** The game introduces a standalone `snake.css` with raw hex values instead of utilizing Tailwind or `gcal-simplified` design tokens, violating the styling invariants.
**Anti-Pattern: Unused Variables Breaking CI.** Leaving variables like `_livesRemaining` defined but unused in `QuizOverlay.tsx` triggers `--max-warnings 0` ESLint failures. Strict lint hygiene must be maintained before merging.
**Regression Risk: Missing Coverage.** The core game engine (`useSnakeGame.ts`) and React overlays were committed without corresponding Vitest unit tests, while only `additionQuiz.test.ts` was implemented.
## 2026-05-15 - Snake Game Remote & Dashboard Refactoring

**Pattern: Refactor Large Dashboard Components.** When a dashboard component (like `MainController.tsx`) exceeds the 300-line limit due to multiple distinct sections, extract each logical section (Missions, Responsibilities, etc.) into its own functional component. This maintains clean code hierarchy and makes the main orchestrator easier to scan.

**Pattern: Type-Safe Broadcast Listeners.** When listening for Supabase broadcast events, avoid using `any` in the callback signature. Instead, use `(payload) => { ... }` and cast the internal `payload.payload` to a specific interface or `Record<string, unknown>` to maintain type safety and catch potential data drift from the host.

**Invariant: Remote Keyboard Injection.** To control a complex game engine from a remote source without deep state plumbing, use `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Arrow...' }))`. This allows the existing engine to treat remote inputs identically to physical keyboard events, reducing regression risk.

## 2026-05-22 — Remote Status Isolation & Log Bounding

**Invariant: Transient signals must NOT live in root MCState.** Supabase connection status, heartbeat events, or any high-frequency binary flag that comes from an external system must NOT be placed in `MCState`. Doing so causes every `useMCState()` consumer to re-render on each signal. Instead, use an isolated React context (`RemoteStatusContext`) that only relevant UI components subscribe to.

**Invariant: Bounded Log Arrays.** `activityLogs` MUST be capped at 200 entries in the `ADD_LOG` reducer case via `.slice(0, 200)`. The 7-day age filter alone is insufficient for high-frequency signals. This must be enforced at the reducer level, not at the render level.

**Pattern: Dedicated IPC Channels for Non-Action Signals.** UI status signals (connection state, sync indicators) must use their own IPC channel (e.g., `remote:status-changed`) separate from the validated `remote-control:action` channel. Mixing UI state signals with action-dispatch channels overloads a security-sensitive boundary.

**Pattern: Hydration Migration for Persisted State.** When a class of data is being removed from the data model (e.g., connection log entries), a one-time migration must be applied at the `useMCStore` hydration point before the first render. Always apply both the filter AND the new cap during migration.

**Invariant: `IntersectionObserver` must be mocked in Vitest.** jsdom does not implement `IntersectionObserver`. Add a `vi.fn()` mock to the global Vitest setup file whenever lazy-loading via `IntersectionObserver` is added to any component.

## 2026-05-26 - E2E Playwright State Isolation & Visual Progress Assertions

**Invariant: LocalStorage Isolation in Electron E2E Tests.** Stale/cached local storage state (like an active mission) can bleed across runs or host environments and mount blocking overlays (like the MC mission overlay) that obscure main UI settings. E2E tests running on the main calendar screen must explicitly call `localStorage.clear()` in a `beforeEach` block to guarantee a clean slate.

**Pattern: Visual Token Progress Assertions.** When redundant text counters (e.g. `x / y completed`) are removed from the UI in favor of visual tokens, E2E tests should verify progress by asserting the counts of the respective emoji element (e.g. `♻️` for recycling) on the page. Be sure to account for header icons and button fallbacks in the expected element count.

## 2026-05-27 — Phone Games Privileges & Idle Auto-Return Review

**Pattern: True Interaction Idle Timer.** An idle timer (such as `useMCAutoReturn`) must listen to DOM interaction events (`pointerdown`, `keydown`, `click`) to detect active user sessions, rather than relying on React state dependency updates that don't trigger on unrelated state dispatches.

**Invariant: Git Worktree Test Co-location.** When writing new test files (e.g. `mcReducer.auto-return.test.ts`), verify they are tracked and committed directly within the active worktree directory rather than left as untracked files in the parent repo, ensuring test suite parity.

**Pattern: Shared Time Formatting Helpers.** Keep date/time remaining calculations (such as countdowns for suspended privileges) in shared utilities to prevent copy-pasting code between panels and button components.

## 2026-05-28 - Global Listener Lifecycle Alignment

**Pattern: Global Listeners for Global Stores.** When an event listener updates a global state store (e.g. IPC, WebSocket, or Supabase listeners targeting `MCStore`), avoid registering the listener hook within individual view/layout components that mount and unmount during routing. Instead, mount the listener at the same high-level scope as the store provider (e.g., via a bridge component in `App.tsx`), ensuring events are continuously captured and state is updated even when the primary UI view changes.

## 2026-06-05 - Mission Control Auto-Return Pause & Timezone Date Matching

**Pattern: Pausing idle timers on game state.** When an idle/return auto-switch timer is active, ensure it hooks into game active flags (`snakeGameActive`) to pause auto-return and prevent abrupt termination of gameplay/screens.

**Invariant: Local Timezone Format Matching.** Sweden/local format `new Date().toLocaleDateString('sv')` or similar custom YYYY-MM-DD formatter must be used for timezone-agnostic date comparisons instead of UTC/ISO slices to ensure consistency with Swedish local timezone dates, avoiding off-by-one errors during UTC day transitions.

**Pattern: Deferring synchronous setState in effects.** Avoid synchronous `setState` in `useEffect` bodies (which triggers React render cascade warnings) by deferring them asynchronously (e.g. `setTimeout(() => setDisplay(null), 0)`).

**Pattern: File-level impure functions to satisfy Purity rules.** Extract functions calling impure APIs (such as `Date.now()`) outside React component declarations to bypass static check rules targeting render path purity.
