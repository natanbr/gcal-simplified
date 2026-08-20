# Test Coverage Plan

**Goal:** Achieve comprehensive unit + E2E coverage for all app features.
**Preference:** Unit tests (Vitest) are primary. At least one E2E (Playwright) per feature.

---

## 2026-08-19 — Why 639 passing tests missed six real bugs

A batch of user-visible bugs shipped while the suite was green. The instinct is
"we need more coverage". That is the wrong lesson: the suite had *high* coverage
on the files involved. What it lacked was whole **categories** of test.

| Bug | Test that existed | Why it missed |
|---|---|---|
| No single-instance lock — two app copies clobbered each other's state | `main_security.test.ts` (4 tests) | Tests assert what code **does**. An absent guard has no lines to cover; no coverage tool can point at code that was never written. |
| `snakeGameActive` restored from disk → phantom "remote game" forever | `loadPersistedState` tests for the `gameTokens` clamp | One field was tested. Nobody asked the general question: *which fields must NOT survive a restart?* |
| Free game token minted on every app launch | **none — `useGameTokenScheduler.ts` had no test file at all** | Never tested. It was small, looked obvious, and was skipped. |
| Scheduler-driven mission starts wrote no log entry | scheduler tests + `activityLog.ts` at 67% | Tests asserted *the dispatch happened*. None asserted *a log entry was produced*. Observability was never a subject of test. |
| OAuth refresh_token destroyed on every save | `auth_security.test.ts` (1 test) | Covered the **security** of the login flow (CSRF state). Nothing covered the credential **lifecycle** — refresh, restart, re-auth. |
| Remote channel accepted any action type | `useRemoteControl.test.ts` (4 tests) | Asserted valid actions dispatch. Never asserted invalid ones are **refused**. |

**The pattern:** the suite tested the happy path of each feature in isolation. It
had almost no *negative* tests (what must be refused), no *lifecycle* tests
(restart, resume, re-auth), and no *structural* tests (invariants that span two
files). Line coverage stays high while every one of those bugs sails through —
which is exactly why "we had good coverage" and "these bugs shipped" were both
true at the same time.

### The four test categories now required

Any change touching state, IPC, credentials or scheduling needs to answer all four:

1. **Happy path** — the feature works. (Already the suite's strength.)
2. **Negative** — the thing it must refuse, refuses. Every allowlist, guard and
   validation needs a test per rejected case.
3. **Lifecycle** — survive a restart, a resume, a re-auth, a clock jump. Round-trip
   real state through persistence rather than asserting single fields.
4. **Structural / drift** — invariants spanning files, enforced by reading the
   source. These catch the "declared but unenforced" class, which is where the
   worst bugs hid.

### Structural guards now in place

| Guard | Enforces |
|---|---|
| `src/__tests__/timer-registry.test.ts` | No unregistered `setInterval`; idle-Calendar timer budget (pre-existing) |
| `src/__tests__/mission-control-isolation.test.ts` | MC never imports from the parent app, and vice versa; no cross-design-system tokens |
| `electron/preload_contract.test.ts` | Every `ipcMain.handle` is whitelisted and every whitelist entry has a handler; audit trail stays append-only; single-instance lock present |
| `useRemoteControl.allowlist.test.ts` — drift guard | Every action the companion remote app sends is allowlisted (and nothing more) |
| `mcReducer.token-generation.test.ts` | No calendar-day token grant can be reintroduced |
| `scripts/verify-single-instance.mjs` | The lock actually holds, verified by launching the built app twice |

The isolation guard found **two real violations on its first run**
(`PrivilegeCardButton.tsx` and `PrivilegesPanel.tsx` imported `src/utils/timeUtils`),
proving the point: the rule had been written in CLAUDE.md and reviewed by hand for
months, and had already been broken. `timeUtils` now lives in
`src/mission-control/utils/`.

### Known remaining gaps (deliberate, ranked)

- `electron/api.ts` — 0%. All Google Calendar/Tasks fetching. Highest-value gap left.
- `electron/store.ts` — 0%. `config.json` read/write and defaults.
- `src/mission-control/games/fruits/*` — 0%. An entire game module.
- `power-policy.ts` 19%, `SnakeCanvas.tsx` 0%, several presentational components.

Component *render* coverage is intentionally NOT the priority. It inflates the
percentage without testing any of the four categories above.

### E2E caveats (read before trusting a run)

- `npm run test:run` is `npx playwright test` — it **never rebuilds**. Specs launch
  `dist-electron/main.js` directly, so a run can be exercising a months-old bundle.
  Always `npx tsc && npx vite build` first.
- The suite runs against the developer's **real** userData — real auth, real
  `config.json`, real `localStorage` — and specs mutate that shared state. 8 specs
  fail on a machine with `weekStartDay: "monday"` because they assume the default.
- It is non-deterministic under load: three runs on identical code gave 8, 24 and 8
  failures. Compare the *set* of failing specs against a baseline, never the count,
  and re-run a failing spec alone before concluding anything.
- Electron windows run offscreen by default (`E2E_HEADLESS`, set by
  `playwright.config.ts`). `E2E_HEADED=1` to watch a run.
- **The real fix, not yet done:** give each launch its own `userData` directory.
  Deferred because a fresh userData has no Google auth, so specs expecting a
  signed-in Dashboard need a seeded auth fixture first.

---

## Phase 1 — Calendar & Navigation Utils (Unit) ✅ Priority: High

Covers: `weekNavigation.ts`, `monthUtils.ts` — both are pure functions with zero tests.

### Files to create

- `src/utils/weekNavigation.test.ts`
- `src/utils/monthUtils.test.ts`

### Cases

- `getWeekStartDate` with 'today', 'monday', 'sunday' modes and various offsets
- `canNavigateToPreviousWeek` (offset > 0 vs 0)
- `isCurrentWeek` (offset === 0)
- `getMonthViewStartDate` / `getMonthViewDates` — 35-day grid correct start, count
- `isCurrentMonth` / `canNavigateBackMonth`

---

## Phase 2 — Event Icon Keywords (Unit) ✅ Priority: High

Covers: `getEventIcon` in `EventCard.tsx` — zero tests for keyword matching.

### Files to create

- `src/utils/eventKeywordIcons.test.ts` (extract `getEventIcon` to `utils/eventKeywordIcons.ts` or test via a helper)

### Cases

- "garbage day" → Trash2 icon
- "trash pickup" → Trash2 icon
- "recycling" → Recycle icon
- "pool party" → Waves icon
- "swim meet" → Waves icon
- "scout meeting" → Users icon
- "karate class" → Swords icon
- "martial arts" → Swords icon
- "birthday party" (no match) → null
- title + description combined match

---

## Phase 3 — Mission Control: COMPLETE_TASK & LOCK_TASK (Unit) ✅ Priority: High

Covers: uncovered reducer actions COMPLETE_TASK and LOCK_TASK.

### Files to create/extend

- New describe blocks in `src/mission-control/store/mcReducer.mission-tasks.test.ts`

### Cases

- COMPLETE_TASK marks correct task completed, others unchanged
- COMPLETE_TASK on already-completed task is idempotent
- COMPLETE_TASK on wrong missionPhase is no-op
- LOCK_TASK marks task locked, others unchanged
- LOCK_TASK on already-locked task is idempotent
- All tasks completed → allDone predicate true (drive from state)
- SET_ACTIVE_MISSION resets all task progress (clean slate each trigger)

---

## Phase 4 — Mission Control: Whining Toggle & Bonus Stars (Unit) ✅ Priority: Medium

Covers the bonus star / whining toggle state (internal to MissionOverlay).

### Files to create/extend

- Extend `MissionOverlay.test.tsx`

### Cases

- Whining toggle initial state is false
- Toggling on shows "-1 bonus" pill badge
- Toggling off removes pill
- Whining resets when mission resets

---

## Phase 5 — Mission Control: MCSettingsOverlay Component (Unit) ✅ Priority: Medium

Covers `MCSettingsOverlay.tsx` — zero tests.

### Files to create

- `src/mission-control/components/MCSettingsOverlay.test.tsx`

### Cases

- Renders with current morning/evening startsAt and duration values
- Changing morning start time dispatches SET_SETTINGS
- Changing evening duration dispatches SET_SETTINGS
- Toggling "Put on cream" dispatches SET_SETTINGS with `creamTaskEnabled`
- Changing cream target days dispatches SET_SETTINGS with `creamTaskDaysTarget`
- Closing the overlay hides it

---

## Phase 5b — Mission Control: Cream Target Logic (Unit) ✅ Priority: Medium

Covers new reducer logic for the dynamic "Put on Cream" evening routine task.

### Files to create/extend

- Extend `src/mission-control/store/mcReducer.settings.test.ts` (or create if missing)
- Extend `src/mission-control/store/mcReducer.mission-tasks.test.ts`

### Cases

- `SET_SETTINGS` enabling cream injects it into the `evening` tasks array before 'bed'
- `SET_SETTINGS` updating cream target resets `creamTaskDaysLeft`
- `COMPLETE_TASK` on 'cream' decrements `creamTaskDaysLeft`
- `COMPLETE_TASK` on 'cream' auto-toggles `creamTaskEnabled: false` when days reach 0 and removes the task

---

## Phase 6 — Mission Control: GlobalBank Component (Unit) ✅ Priority: Medium

Covers `GlobalBank.tsx` — zero tests.

### Files to create

- `src/mission-control/components/GlobalBank.test.tsx`

### Cases

- Renders correct bank count
- (+) button dispatches ADD_TOKEN
- (-) button dispatches REMOVE_TOKEN
- (-) button disabled when bankCount is 0
- Token count display updates after dispatch

---

## Phase 7 — E2E: One per uncovered feature ✅ Priority: Medium

Add at least one E2E smoke test for each feature with no E2E coverage.

### Files to create/extend

- `e2e/monthly-view.spec.ts` — toggle to monthly view, navigate months
- `e2e/mc-bank-management.spec.ts` — open bank popup, add/remove coins
- `e2e/mc-settings.spec.ts` — open MC settings, change morning time, save

---

## Phase 8 — Calendar Event Display (Unit) ✅ Priority: Low

Covers `weekNavigation.ts` + `colorMapping.ts` gaps.

### Files to create/extend

- Extend `colorMapping.test.ts` with all 11 Google Calendar colorIds
- Add tests for name-based fallback colors (Natan→Blue, Alon→Green, etc.)
  - NOTE: These are no longer in `colorMapping.ts` (removed) — verify if they live elsewhere

---

## Phase 9 — Mission Control: Token Drag and Drop (E2E) ⏳ Priority: Low

Covers the complex drag-and-drop interactions for moving tokens between the `GlobalBank` and `GoalPedestal` components. Unit tests for the store actions (`MOVE_TOKEN`) are already complete resulting in 100% logic coverage, but E2E is needed to guarantee visual layer behavior.

### Files to create

- `e2e/mc-token-movement.spec.ts`

### Cases

- Drag a token from the bank to an active goal card (verify token count in both decreases and increases).
- Drag a token from an active goal card back to the bank.
- Drag a token from one active goal card to another active goal card.
- Verify tokens correctly spring back if dropped outside a valid drop target.

---

## Phase 10 — Performance Profiling & React Effects (Unit) ⏳ Priority: High

Covers explicit verification of effect cleanups and memory leak preventions in custom hooks and UI components that leverage timers.

### Files to create

- `src/mission-control/hooks/useLiveClock.test.ts`
- `src/mission-control/hooks/useMinuteClock.test.ts`
- `src/mission-control/components/MissionTimerDisplay.test.tsx` (new tests)

### Cases

- `useLiveClock` must clear its internal `setInterval` when the hook unmounts.
- `useMinuteClock` must clear its recursive `setTimeout` when the hook unmounts.
- `MissionTimerDisplay` must clear its long-press `setTimeout` if unmounted mid-press to prevent state updates on unmounted components.

---

## Status Tracking

| Phase | Status     | Files                                                                       |
| ----- | ---------- | --------------------------------------------------------------------------- |
| 1     | ✅ Done    | `weekNavigation.test.ts`, `monthUtils.test.ts`                              |
| 2     | ✅ Done    | `eventKeywordIcons.ts`, `eventKeywordIcons.test.ts`                         |
| 3     | ✅ Done    | `mcReducer.mission-tasks.test.ts`                                           |
| 4     | ✅ Done    | `MissionOverlay.test.tsx` — whining toggle + reset button                   |
| 5     | ✅ Done    | `MCSettingsOverlay.test.tsx`                                                |
| 5b    | ✅ Done    | `mcReducer.settings.test.ts` — cream task inject/remove/decrement/auto-off  |
| 6     | ✅ Done    | `GlobalBank.test.tsx`                                                       |
| 7     | ✅ Done    | `monthly-view.spec.ts`, `mc-bank-management.spec.ts`, `mc-settings.spec.ts` |
| 8     | ✅ Done    | `colorMapping.test.ts` — all 11 colorIds + priority/fallback                |
| 9     | ⏳ Pending | `mc-token-movement.spec.ts` (E2E drag-and-drop tests)                       |
| 10    | ✅ Done    | `useLiveClock`, `useMinuteClock`, `MissionTimerDisplay` memory leak checks  |

### Unit test count: **452 ✅ (0 failures)** across 48 test files

### E2E tests added: 3 new spec files (9 new tests, run against built Electron app)

---

## Coverage Summary (v8, `src/` only)

> Run: `npx vitest run --coverage` (requires `@vitest/coverage-v8@3.2.4` to match vitest version)

| Area                          | Stmts | Branch | Funcs | Notes                                          |
| ----------------------------- | ----- | ------ | ----- | ---------------------------------------------- |
| `src/utils/`                  | ~97%  | ~92%   | ~96%  | Near-complete; `colorMapping`, `eventKeywordIcons` at 100% |
| `src/mission-control/store/`  | ~94%  | ~84%   | 100%  | Reducer 97.8%, store wrapper 83%               |
| `src/mission-control/hooks/`  | 100%  | 100%   | 100%  | `useLiveClock`, `useMinuteClock` fully covered |
| `src/mission-control/components/` | ~85% | ~84% | ~65% | Some views (e.g. `AchievementView`) at 0% — no tests yet |
| `src/hooks/`                  | ~98%  | ~87%   | 100%  | `useCurrentDate`, `useTheme` well covered      |
| `electron/`                   | ~46%  | ~73%   | 50%   | `weather.ts` 95%, `api.ts` 0% (untestable in jsdom) |

### Uncovered / partially covered files to watch

- `src/mission-control/components/AchievementView.tsx` — 0% (no tests)
- `src/mission-control/hooks/useScheduler.ts` — 0% stmts (logic covered via reducer tests)
- `src/mock/events.ts` — 0% stmts (fixture file, acceptable)
- `electron/api.ts` — 0% (requires Electron IPC, not unit-testable)
