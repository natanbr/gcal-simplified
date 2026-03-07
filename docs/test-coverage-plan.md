# Test Coverage Plan

**Goal:** Achieve comprehensive unit + E2E coverage for all app features.
**Preference:** Unit tests (Vitest) are primary. At least one E2E (Playwright) per feature.

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
- Closing the overlay hides it

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

## Status Tracking

| Phase | Status  | Files                                                                       |
| ----- | ------- | --------------------------------------------------------------------------- |
| 1     | ✅ Done | `weekNavigation.test.ts`, `monthUtils.test.ts`                              |
| 2     | ✅ Done | `eventKeywordIcons.ts`, `eventKeywordIcons.test.ts`                         |
| 3     | ✅ Done | `mcReducer.mission-tasks.test.ts`                                           |
| 4     | ✅ Done | `MissionOverlay.test.tsx` — whining toggle + reset button                   |
| 5     | ✅ Done | `MCSettingsOverlay.test.tsx`                                                |
| 6     | ✅ Done | `GlobalBank.test.tsx`                                                       |
| 7     | ✅ Done | `monthly-view.spec.ts`, `mc-bank-management.spec.ts`, `mc-settings.spec.ts` |
| 8     | ✅ Done | `colorMapping.test.ts` — all 11 colorIds + priority/fallback                |

### Final unit test count: 397 ✅ (0 failures)

### E2E tests added: 3 new spec files (9 new tests, run against built Electron app)
