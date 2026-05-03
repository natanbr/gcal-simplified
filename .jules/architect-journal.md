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
## 2026-05-03 - Split mcReducer\n\n**Learning:** When refactoring large monolithic reducers (e.g., `mcReducer.ts`), separate them into smaller, domain-specific reducers (e.g., `economyReducer.ts`, `missionReducer.ts`) in a localized `reducers/` directory and compose them in the main file. Use existing split test files as a guide for identifying domain boundaries.\n**Action:** Always look for natural boundaries, such as those established by test files, to guide the separation of concerns when splitting large files.
