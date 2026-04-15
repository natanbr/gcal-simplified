## 2024-05-24 - Workflow Diligence

**Learning:** When using temporary scripts (like python or bash scripts) to programmatically edit large files, I must remember to delete these throwaway files before committing. Also, I must strictly adhere to the requested scope of work and not get sidetracked by fixing unrelated failing tests or minor type warnings in other parts of the codebase, as this clutters the PR and can introduce unexpected test failures.
**Action:** Always run `git status` to verify the exact list of files being committed and ensure no garbage files or unrelated modified files are included in the staging area.

## 2026-04-15 - Mission Control Long-Press & Activity Log Review

**Pattern: Reusable Interaction Hooks.** When pointer-based interaction logic (long-press, drag, swipe) is used on 2+ elements, extract it into a custom hook immediately. The `useLongPress(onShort, onLong, thresholdMs)` pattern returns `{ onPointerDown, onPointerUp, onPointerLeave }` and centralizes ref cleanup.

**Pattern: Log Entry Goal Resolution.** The `createLogEntry` function resolves goal names from `REWARD_MAP` in 5+ places. Hoist a shared `goalLabel(caseId, state)` helper to the top of the function to prevent drift.

**Invariant: Duration Calculations.** Any time-duration math based on `startsAt`/`endsAt` HH:MM strings must handle midnight crossings: `if (durationMins < 0) durationMins += 24 * 60`.

**False Positive: Missing whileTap on long-press buttons.** This is intentional — the user explicitly requested no visual feedback to keep long-press features hidden from the child user. Do NOT flag this in future reviews.
